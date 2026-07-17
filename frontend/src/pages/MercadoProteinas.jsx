import { useState, useEffect } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { sanitizeRichText } from '../lib/sanitizeHtml.js';
import { usePageStyles, loadScriptsInOrder } from '../lib/assets.js';
import './MercadoProteinas.css';

const PROT_CK = 'prot_v11';
const IMGS_PROT = ['/img/mercadoP.webp', '/img/mercados.webp', '/img/finanzas.webp'];
const CATS_P = { cerdo: 'Cerdo · Mercado', pollo: 'Pollo · Tendencias', res: 'Res · Comercio' };
const IMPS_P = { cerdo: 'alto', pollo: 'medio', res: 'bajo' };
const DCS_P = ['cerdo', 'pollo', 'res'];

// Porta la lógica original (cargarProteinas): fetch de noticias + commodities,
// cálculo de precios/márgenes/ratios y ensamblado del objeto de datos.
async function computeProteinas(VDS) {
  const now = new Date();
  const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fechaFmt = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  const [gdProtR, gdFeedR, fhR] = await Promise.allSettled([
    VDS.gdeltNews('pork poultry beef cattle hog livestock chicken meat protein', 6),
    VDS.gdeltNews('corn soybean feed cost USDA livestock grain animal', 5),
    VDS.finnhubNews('general'),
  ]);
  const pick = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length ? r.value : []);
  const gdProt = pick(gdProtR), gdFeed = pick(gdFeedR), fhRaw = pick(fhR);

  const allNews = [...gdProt, ...gdFeed, ...fhRaw];
  const seen = new Set();
  const unique = allNews.filter((a) => {
    const k = (a.title || '').trim().toLowerCase().slice(0, 60);
    if (!k || k.length < 8 || seen.has(k)) return false;
    seen.add(k); return true;
  });

  const pools = { cerdo: [], pollo: [], res: [] };
  unique.forEach((a) => {
    const t = (a.title || '').toLowerCase();
    if (t.match(/pork|hog|cerdo|swine|bacon|jamón/)) { if (pools.cerdo.length < 2) pools.cerdo.push(a); }
    else if (t.match(/poult|chicken|broiler|pollo|aviar|turkey/)) { if (pools.pollo.length < 2) pools.pollo.push(a); }
    else if (t.match(/beef|cattle|bovine|res|ganado|angus|feedlot/)) { if (pools.res.length < 2) pools.res.push(a); }
  });
  let fillIdx = 0;
  DCS_P.forEach((cat) => { while (pools[cat].length === 0 && fillIdx < unique.length) pools[cat].push(unique[fillIdx++]); });

  const [hogsR, cattleR, cornR, soyR] = await Promise.allSettled([
    VDS.commodityWithPct('LEAN_HOGS'),
    VDS.commodityWithPct('LIVE_CATTLE'),
    VDS.commodityWithPct('CORN'),
    VDS.commodityWithPct('SOYBEANS'),
  ]);
  const vp = (r) => (r.status === 'fulfilled' && r.value?.price ? r.value : null);
  const hogsD = vp(hogsR), cattleD = vp(cattleR), cornD = vp(cornR), soyD = vp(soyR);

  const cornP = cornD?.price ?? 4.82;
  const soyP = soyD?.price ?? 342.0;
  const cerdoP = hogsD ? +(hogsD.price * 0.022).toFixed(2) : 2.45;
  const resP = cattleD ? +(cattleD.price * 0.022).toFixed(2) : 4.80;
  const polloP = +(Math.max(2.50, Math.min(3.50, 2.90 + (cornP - 4.82) * 0.08))).toFixed(2);
  const cerdoPct = hogsD?.pct ?? 0;
  const resPct = cattleD?.pct ?? 0;
  const polloPct = +((cornD?.pct ?? 0) * 0.65).toFixed(2);
  const precios = { cerdo: cerdoP, cerdo_pct: cerdoPct, pollo: polloP, pollo_pct: polloPct, res: resP, res_pct: resPct };

  const feedMaiz = (cornP / 25.4) * 2.8;
  const feedSoya = (soyP / 1000) * 0.8;
  const costoFijo = 2.00;
  const costoTotal = +(feedMaiz + feedSoya + costoFijo).toFixed(2);
  const margenVal = +(cerdoP - costoTotal).toFixed(2);
  const margenStr = `${margenVal >= 0 ? '+' : ''}$${margenVal}`;
  const feedTotal = +(feedMaiz + feedSoya).toFixed(2);
  const feedChg = cornD?.pct ? `${VDS.fmtPct(cornD.pct)} maíz` : '—';

  const margen = {
    valor: margenStr,
    analisis:
      `Maíz <b>$${cornP.toFixed(2)}/bu</b>${cornD ? '' : ' <i>(ref.)</i>'} · Soya <b>$${(soyP / 100).toFixed(2)}/cwt</b>${soyD ? '' : ' <i>(ref.)</i>'}.<br>`
      + `Feed cost: <b>$${(feedMaiz + feedSoya).toFixed(2)}/kg</b> + fijos $${costoFijo}/kg = $${costoTotal}/kg total.<br>`
      + (margenVal >= 0
        ? `Margen operativo estimado: <b style="color:#4ade80">${margenStr}/kg</b>.`
        : `<b style="color:#f87171">Margen negativo ${margenStr}/kg</b> — ajustar precio de venta.`),
  };

  const noticias = DCS_P.map((cat, idx) => {
    const a = pools[cat][0];
    if (a?.title) {
      return {
        cat: CATS_P[cat], dc: cat, imp: IMPS_P[cat],
        titulo: (a.title || '').slice(0, 120),
        desc: (a.description || a.desc || a.summary || '').slice(0, 380),
        fuente: (a.source || a.domain || (idx < gdProt.length ? 'GDELT' : 'FINNHUB')).toUpperCase(),
        fecha: `${fechaFmt} · ${hora}`,
      };
    }
    const synth = [
      { titulo: `Lean Hogs CME $${cerdoP}/kg${hogsD ? '' : ' (ref.)'}`, desc: `Futuros de cerdo: $${cerdoP}/kg. Feed cost est. $${feedTotal}/kg (maíz $${cornP.toFixed(2)}/bu). Margen: ${margenStr}/kg.` },
      { titulo: `Pollo broiler ~$${polloP}/kg (derivado maíz $${cornP.toFixed(2)}/bu)`, desc: `Estimado por correlación maíz-avícola. Maíz ${VDS.fmtPct(cornD?.pct ?? 0)} hoy. Soya $${(soyP / 100).toFixed(2)}/cwt.` },
      { titulo: `Live Cattle CME $${resP}/kg${cattleD ? '' : ' (ref.)'}`, desc: `Ganado en pie: $${resP}/kg. Diferencial res/cerdo $${(parseFloat(resP) - parseFloat(cerdoP)).toFixed(2)}/kg. Ratio cerdo/pollo ${(parseFloat(cerdoP) / parseFloat(polloP)).toFixed(2)}.` },
    ];
    return { cat: CATS_P[cat], dc: cat, imp: IMPS_P[cat], titulo: synth[idx].titulo, desc: synth[idx].desc, fuente: hogsD ? 'ALPHA VANTAGE' : 'CME REF.', fecha: `${fechaFmt} · ${hora}` };
  });

  const ratio = (parseFloat(cerdoP) / parseFloat(polloP)).toFixed(2);
  const tendCerdo = cerdoPct > 0.5 ? 'al alza' : cerdoPct < -0.5 ? 'a la baja' : 'estable';
  const exportInsight =
    `<b>MERCADO ${fechaFmt}:</b> Cerdo ${tendCerdo} — $${cerdoP}/kg${hogsD ? ' (AV)' : ' (ref.)'}. `
    + (cornP > 5.20 ? 'Feed cost elevado: exportaciones bajo presión. ' : 'Feed cost en rango: exportaciones competitivas. ')
    + '<b>Filipinas y Vietnam</b> ofrecen oportunidad +10% sobre destinos actuales.';
  const consumePara =
    `Ratio cerdo/pollo: ${ratio} (${parseFloat(ratio) < 0.90 ? 'ventaja competitiva' : parseFloat(ratio) < 1.0 ? 'diferencial moderado' : 'cerdo = pollo'}). `
    + `Feed cost $${feedTotal}/kg (maíz $${cornP.toFixed(2)}/bu${cornD ? '' : ', ref.'}, soya $${(soyP / 100).toFixed(2)}/cwt${soyD ? '' : ', ref.'}). `
    + 'Expansión de plantas en Bajío proyecta capacidad adicional 2026-2027.';

  return {
    precios, margen, ratio, noticias, exportInsight, consumePara,
    exportTitle: `Exportaciones México · Porcino FOB ${fechaFmt}`,
    expJapon: `$${(parseFloat(cerdoP) + 0.35).toFixed(2)}/kg`,
    expCorea: `$${(parseFloat(cerdoP) + 0.25).toFixed(2)}/kg`,
    expChina: `$${(parseFloat(cerdoP) + 0.45).toFixed(2)}/kg`,
    expOtros: `$${(parseFloat(cerdoP) + 0.15).toFixed(2)}/kg`,
    feedTotal, feedChg,
  };
}

function Pct({ value }) {
  const n = parseFloat(value);
  return <span className={n >= 0 ? 'mp-up' : 'mp-down'}>{(n >= 0 ? '+' : '') + n.toFixed(1)}%</span>;
}

export default function MercadoProteinas() {
  usePageStyles(['/css/header.css?v=6', '/css/footer.css']);
  const [data, setData] = useState(null);
  const [aiText, setAiText] = useState('');
  const [cat, setCat] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadScriptsInOrder(['/js/api-keys.js?v=3', '/js/data-service.js?v=15']);
      const VDS = window.VDS;
      if (!VDS || cancelled) return;

      const stored = VDS.load(PROT_CK, true);
      const expired = VDS.isExpired(PROT_CK);
      if (stored?.noticias?.length) {
        setData(stored);
        if (!expired) return;
        VDS.clear(PROT_CK);
      }
      try {
        const fresh = await computeProteinas(VDS);
        if (cancelled) return;
        VDS.save(PROT_CK, fresh);
        setData(fresh);
        // Análisis de margen con VALL-AI (Gemini); si falla, queda el estático.
        const p = fresh.precios;
        const prompt = `Eres VALL-AI, analista de márgenes para la industria pecuaria mexicana. Con estos datos actuales, redacta un análisis breve (2-3 oraciones) del margen de producción porcina y su tendencia:\n\nPrecio cerdo: $${p.cerdo}/kg (${p.cerdo_pct}%)\nMargen estimado: ${fresh.margen.valor}/kg\nPrecio pollo: $${p.pollo}/kg\nPrecio res: $${p.res}/kg\n\nSé directo y práctico para productores mexicanos, sin frases de apertura genéricas.`;
        const SYS = 'Eres un analista financiero institucional de VALL News especializado en agroindustria y ganadería. Responde en español, de forma concisa y profesional. Máximo 100 palabras.';
        VDS.geminiChat(prompt, SYS).then((text) => { if (!cancelled && text) setAiText(text); }).catch(() => {});
      } catch (e) {
        console.error('Proteínas:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const noticias = data?.noticias || [];
  const p = data?.precios;
  const ratioN = data ? parseFloat(data.ratio) : 0;
  const ratioMsg = ratioN < 0.85 ? 'El cerdo gana competitividad — brecha con pollo se estrecha.'
    : ratioN < 1.0 ? 'Diferencial moderado — ambas proteínas compiten en precio.'
    : 'El cerdo supera en precio al pollo — presión en demanda.';
  const showRow = (c) => cat === 'all' || cat === c;

  return (
    <>
      <Header />
      <div className="mp-container">
        <h1 className="mp-title"><i className="fas fa-drumstick-bite"></i> Mercado Proteínas</h1>

        <div className="mp-filter">
          {[['all', 'TODOS'], ['cerdo', '🐖 CERDO'], ['pollo', '🐔 POLLO'], ['res', '🐄 RES']].map(([c, lbl]) => (
            <button key={c} className={`mp-pill${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>{lbl}</button>
          ))}
        </div>

        {/* Noticias */}
        <div className="mp-news-grid">
          {!data && <div className="mp-loading"><i className="fas fa-circle-notch fa-spin"></i>&nbsp; Obteniendo mercado de proteínas…</div>}
          {noticias.filter((n) => cat === 'all' || n.dc === cat).map((n, i) => (
            <div className="mp-card" key={n.dc + i}>
              <img className="mp-card-img" src={IMGS_PROT[i % IMGS_PROT.length]} alt={n.cat} onError={(e) => { e.target.style.display = 'none'; }} />
              <div className="mp-card-body">
                <span className="mp-card-cat">{n.cat}</span>
                <span className="mp-card-date">{n.fecha}</span>
                <h3 className="mp-card-title">{n.titulo}</h3>
                <p className="mp-card-desc">{n.desc}</p>
                <div className="mp-card-foot">
                  <span className="mp-tag-src">{n.fuente}</span>
                  {n.imp === 'alto' ? <span className="mp-tag-high">CRÍTICO</span>
                    : n.imp === 'medio' ? <span className="mp-tag-med">MEDIA</span>
                    : <span className="mp-tag-low">BAJA</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mp-bottom">
          <div className="mp-col">
            {/* Precios */}
            <div className="mp-panel">
              <div className="mp-section-lbl">Precios Internacionales (USD / KG)</div>
              {showRow('cerdo') && (
                <div className="mp-price-row">
                  <span className="mp-price-name">🐖 Cerdo (Pierna / Lomo)</span>
                  <span><span className="mp-price-val">${p ? parseFloat(p.cerdo).toFixed(2) : '2.45'}</span>{p && <Pct value={p.cerdo_pct} />}</span>
                </div>
              )}
              {showRow('pollo') && (
                <div className="mp-price-row">
                  <span className="mp-price-name">🐔 Pollo (Pechuga)</span>
                  <span><span className="mp-price-val">${p ? parseFloat(p.pollo).toFixed(2) : '2.90'}</span>{p && <Pct value={p.pollo_pct} />}</span>
                </div>
              )}
              {showRow('res') && (
                <div className="mp-price-row">
                  <span className="mp-price-name">🐄 Res (Cortes Selectos)</span>
                  <span><span className="mp-price-val">${p ? parseFloat(p.res).toFixed(2) : '4.80'}</span>{p && <Pct value={p.res_pct} />}</span>
                </div>
              )}
              <div className="mp-ratio-note">
                <i className="fas fa-robot"></i>&nbsp;
                <b>Ratio Cerdo/Pollo: {data?.ratio ?? '0.84'}</b> — {data ? ratioMsg : 'El cerdo gana competitividad al estrecharse la brecha de precio frente al pollo.'}
              </div>
            </div>

            {/* Exportaciones */}
            <div className="mp-panel">
              <div className="mp-section-lbl">{data?.exportTitle || 'Exportaciones México · Cargando…'}</div>
              {[['🇯🇵 Japón (40%)', data?.expJapon, 40, false], ['🇰🇷 Corea del Sur (25%)', data?.expCorea, 25, false], ['🇨🇳 China (15%)', data?.expChina, 15, true], ['🌎 Otros (20%)', data?.expOtros, 20, false]].map(([lbl, val, w, accent]) => (
                <div className="mp-dest-bar" key={lbl}>
                  <div className="mp-bar-label"><span>{lbl}</span><b>{val || '$—'}</b></div>
                  <div className="mp-bar-bg"><div className={`mp-bar-fill${accent ? ' accent' : ''}`} style={{ width: `${w}%`, opacity: w === 20 ? 0.6 : 1 }}></div></div>
                </div>
              ))}
              <div className="mp-export-insight" dangerouslySetInnerHTML={{ __html: sanitizeRichText(data?.exportInsight || 'Cargando análisis de mercado…') }} />
            </div>
          </div>

          <div className="mp-col">
            {/* Margen VALL-AI */}
            <div className="mp-margin-card">
              <div className="mp-margin-lbl">Alerta de Margen · VALL-AI</div>
              <div className="mp-margin-val" style={{ color: data && parseFloat((data.margen.valor || '0').replace(/[+$]/g, '')) < 0 ? '#f87171' : '#4ade80' }}>
                {data?.margen.valor || '+$0.12'}<small style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }}> /kg</small>
              </div>
              <div className="mp-margin-sub" dangerouslySetInnerHTML={{ __html: sanitizeRichText(aiText || data?.margen.analisis || 'Calculando margen de producción…') }} />
            </div>

            {/* Tendencias */}
            <div className="mp-panel">
              <div className="mp-section-lbl">Tendencias de Consumo</div>
              <div className="mp-stat-grid">
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Ratio Cerdo/Res</div>
                  <div className="mp-stat-val">{data?.ratio ?? '—'}</div>
                  <div className="mp-stat-chg">{data ? (ratioN < 1 ? 'cerdo < res' : 'cerdo = res') : 'calculando'}</div>
                  <div className="mp-stat-note">precio relativo actual</div>
                </div>
                <div className="mp-stat-box">
                  <div className="mp-stat-lbl">Feed Cost Est.</div>
                  <div className="mp-stat-val">{data ? `$${data.feedTotal}` : '—'}</div>
                  <div className="mp-stat-chg">{data?.feedChg || 'maíz + soya'}</div>
                  <div className="mp-stat-note">USD / kg cerdo</div>
                </div>
              </div>
              <p className="mp-consume">{data?.consumePara || 'El cerdo desplaza a la res en USA por factor precio (+5% sustitución). La expansión de plantas en el Bajío asegura capacidad para demanda de embutidos en 2026-2027.'}</p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
