
const VDS = (() => {
  const TTL = 12 * 60 * 60 * 1000; // 12 h en ms
  // Incrementamos PFX para forzar invalidación de cachés anteriores (removido BUILD_ID)
  const PFX = 'vn4_';

  async function safeFetch(url, options = {}, ms = 9000) {
    const ctrl = new AbortController();
    const id   = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal, ...options });
    } finally {
      clearTimeout(id);
    }
  }

  function load(k, staleOk = false) {
    try {
      const o = JSON.parse(localStorage.getItem(PFX + k));
      if (!o) return null;
      if (Date.now() - o.ts < TTL) return o.d;   // fresco
      if (staleOk) return o.d;                    // vencido pero aceptable
    } catch {}
    return null;
  }
  function isExpired(k) {
    try {
      const o = JSON.parse(localStorage.getItem(PFX + k));
      return !o || Date.now() - o.ts >= TTL;
    } catch { return true; }
  }
  function save(k, d) {
    try { localStorage.setItem(PFX + k, JSON.stringify({ ts: Date.now(), d })); } catch {}
  }
  function clear(k) {
    try { localStorage.removeItem(PFX + k); } catch {}
  }
  async function usdmxn() {
    const key = 'rate_usdmxn';
    const c = load(key);
    if (c !== null) return c;
    try {
      const r = await safeFetch('https://open.er-api.com/v6/latest/USD');
      const j = await r.json();
      const v = j?.rates?.MXN;
      if (v) { save(key, v); return v; }
    } catch {}
    return load(key, true); // stale-ok si la API falla
  }
  async function commodity(fn) {
    if (!VAPI.alphaVantage) return null;
    const c = load('av_c_' + fn);
    if (c !== null) return c;
    const qs = new URLSearchParams({ function: fn, apikey: VAPI.alphaVantage });
    const r = await safeFetch(`https://www.alphavantage.co/query?${qs}`);
    const j = await r.json();
    if (j?.Information || j?.Note) return null;
    const v = parseFloat(j?.data?.[0]?.value);
    if (!isNaN(v)) { save('av_c_' + fn, v); return v; }
    return null;
  }

  // Factores de conversión de unidades Alpha Vantage → unidades de display
  // AV devuelve granos y metales en $/MT; los convertimos a la unidad estándar de cada mercado
  const _CONV = {
    CORN:        1 / 39.368,   // $/MT  → $/bu   (1 MT maíz = 39.368 bu)
    WHEAT:       1 / 36.744,   // $/MT  → $/bu   (1 MT trigo = 36.744 bu)
    SOYBEANS:    1,            // $/MT  → $/MT   (sin conversión)
    CRUDE_OIL:   1,            // $/bbl → $/bbl  (sin conversión)
    COPPER:      1 / 2204.62,  // $/MT  → $/lb   (1 MT = 2204.62 lb)
    NATURAL_GAS: 1,            // $/MMBtu → $/MMBtu
    ALUMINUM:    1,            // $/MT  → $/MT
  };

  async function commodityWithPct(fn) {
    const key = 'av_cpx_' + fn; // 'x' = extended (price + pct + pct3m + history)
    const c = load(key);
    if (c !== null) return c;
    try {
      const r = await safeFetch(`/api/commodity?fn=${encodeURIComponent(fn)}`);
      if (!r.ok) return load(key, true); // stale-ok si el servidor falla
      const j = await r.json();
      if (j?.error) return load(key, true);
      const data = j?.data;
      if (!Array.isArray(data) || data.length < 1) return load(key, true);
      const raw     = parseFloat(data[0]?.value);
      if (isNaN(raw)) return load(key, true);
      const rawPrev = data.length >= 2  ? parseFloat(data[1]?.value) : NaN;
      const raw3m   = data.length >= 4  ? parseFloat(data[3]?.value) : NaN;
      const conv    = _CONV[fn] ?? 1;
      const pct     = (!isNaN(rawPrev) && rawPrev > 0) ? +((raw - rawPrev) / rawPrev * 100).toFixed(2) : 0;
      const pct3m   = (!isNaN(raw3m)   && raw3m   > 0) ? +((raw - raw3m)   / raw3m   * 100).toFixed(2) : 0;
      // Últimos 6 meses para sparkline (más reciente al final del array → reverse)
      const history = data.slice(0, 6).reverse().map(d => +(parseFloat(d.value) * conv).toFixed(4));
      const result  = { price: +(raw * conv).toFixed(4), pct, pct3m, history };
      save(key, result);
      return result;
    } catch { return load(key, true); } // fallback a caché vencida antes que null
  }
  async function quote(symbol) {
    if (!VAPI.alphaVantage) return null;
    const c = load('av_q_' + symbol);
    if (c !== null) return c;
    const qs = new URLSearchParams({ function: 'GLOBAL_QUOTE', symbol, apikey: VAPI.alphaVantage });
    const r = await safeFetch(`https://www.alphavantage.co/query?${qs}`);
    const j = await r.json();
    if (j?.Information || j?.Note) return null;
    const gq = j?.['Global Quote'];
    if (!gq) return null;
    const v = {
      price: parseFloat(gq['05. price']),
      pct:   parseFloat((gq['10. change percent'] || '0').replace('%', ''))
    };
    save('av_q_' + symbol, v);
    return v;
  }
  async function banxico(serie) {
    const c = load('bnx_' + serie);
    if (c !== null) return c;
    try {
      const r = await safeFetch(`/api/banxico/${serie}`);
      const j = await r.json();
      const v = parseFloat(j?.bmx?.series?.[0]?.datos?.[0]?.dato);
      if (!isNaN(v)) { save('bnx_' + serie, v); return v; }
    } catch {}
    return null;
  }

  async function finnhubNews(category = 'general') {
    const key = `finnhub_${category}`;
    const c = load(key);
    if (c !== null) return c;
    try {
      const r = await safeFetch(`/api/finnhub-news?category=${encodeURIComponent(category)}`, {}, 8000);
      if (!r.ok) return null;
      const j = await r.json();
      if (!Array.isArray(j)) return null;
      const items = j.slice(0, 20).map(a => ({
        title: a.headline || a.summary || a.category,
        source: a.source || 'Finnhub',
        publishedAt: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
        url: a.url,
        category: a.category,
        description: a.summary || '',
        image: a.image || '',
      }));
      if (items.length) save(key, items);
      return items;
    } catch { return null; }
  }
  async function newsAlphaVantage(topics = 'commodities', limit = 5) {
    const key = `av_news_${topics}_${limit}`;
    const c = load(key);
    if (c !== null) return c;
    const qs = new URLSearchParams({ topics, limit });
    const r = await safeFetch(`/api/alphavantage-news?${qs}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.Information || j?.Note || j?.error) return null;
    const feed = j?.feed;
    if (!Array.isArray(feed) || !feed.length) return null;
    const items = feed.slice(0, limit).map(a => ({
      title: a.title,
      source: a.source || a.source_domain || 'Alpha Vantage',
      publishedAt: a.time_published || null,
      url: a.url,
      description: a.summary || '',
      sentiment: a.overall_sentiment_label || '',
      image: a.banner_image || '',
    }));
    if (items.length) save(key, items);
    return items;
  }
  // Serializa requests GDELT en el cliente: si ya hay un request en vuelo,
  // el siguiente espera a que termine antes de ir al backend.
  // Esto evita que dos fetches simultáneos vayan a instancias serverless
  // distintas (cada una con _gdeltLastAt=0), lo que dispararía el rate-limit.
  let _gdeltSerial = Promise.resolve();

  async function gdeltNews(query, maxrecords = 5) {
    if (!query) return null;
    const key = `gdelt_${query}_${maxrecords}`;
    const cached = load(key);
    if (cached !== null) return cached;

    // Encolar: esperar a que el request anterior termine antes de disparar
    return (_gdeltSerial = _gdeltSerial.then(async () => {
      const c2 = load(key); // re-verificar: otro request puede haberlo cacheado
      if (c2 !== null) return c2;
      try {
        const qs = new URLSearchParams({ query, mode: 'ArtList', maxrecords });
        // 30s: con varias consultas GDELT encoladas en la misma carga de página,
        // 20s a veces no alcanzaba para las últimas de la fila y se cancelaban
        // solas (silenciosamente, sin cachear nada) antes de recibir respuesta.
        const r  = await safeFetch(`/api/gdelt?${qs}`, {}, 30000);
        const j  = await r.json();
        const items = (j?.articles || []).slice(0, maxrecords).map(a => ({
          title: a.title, source: a.domain, publishedAt: a.seendate,
          url: a.url, description: a.seentext || '', image: a.socialimage || '',
        }));
        if (items.length) save(key, items);
        return items;
      } catch { return []; }
    }).catch(() => []));
  }

  // ── Gemini AI (vía backend — la API key nunca se expone al cliente) ──
  // Devuelve el primer objeto JSON encontrado en la respuesta
  // ck: clave de caché (null = sin caché)
  async function gemini(prompt, ck) {
    if (ck) { const c = load('gm_' + ck); if (c !== null) return c; }
    const res = await safeFetch('/api/ai-insight', {
      method:  'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt })
    }, 35000); // gemini-3.1-pro-preview razona antes de responder — puede tardar 8-18s+
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error || `Gemini HTTP ${res.status}`);
    }
    const j    = await res.json();
    const text = j?.reply || '';
    const m    = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Gemini no devolvió JSON válido');
    const data = JSON.parse(m[0]);
    if (ck) save('gm_' + ck, data);
    return data;
  }

  // — Gemini Chat (text response, no JSON parsing) —
  // For report analysis and conversational AI. Returns raw text.
  async function geminiChat(prompt, systemPrompt) {
    const res = await safeFetch('/api/ai-insight', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemPrompt })
    }, 35000); // gemini-3.1-pro-preview razona antes de responder — puede tardar 8-18s+
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error || `Gemini HTTP ${res.status}`);
    }
    const j = await res.json();
    return j?.reply || '';
  }

  // ── MyMemory: traducción automática al español ────────────
  // Gratuita, sin clave, CORS-friendly. Límite: ~1000 req/día.
  // La traducción se cachea para no repetir llamadas.
  async function translate(text, from = 'en', to = 'es') {
    if (!text || text.trim().length < 5) return text;
    const key = 'tr_' + btoa(unescape(encodeURIComponent(text.slice(0, 60)))).slice(0, 32);
    const c = load(key);
    if (c !== null) return c;
    const qs = new URLSearchParams({ q: text.slice(0, 500), langpair: `${from}|${to}` });
    const r = await safeFetch(`https://api.mymemory.translated.net/get?${qs}`, {}, 6000);
    const j = await r.json();
    const t = j?.responseData?.translatedText;
    if (t && j?.responseStatus === 200 && t !== 'PLEASE SELECT TWO DISTINCT LANGUAGES') {
      save(key, t);
      return t;
    }
    return text;
  }

  // Traduce un array de objetos noticias: titulo + desc → español
  // Corre todas las traducciones en paralelo para ser rápido
  async function translateNews(items) {
    if (!items?.length) return items;
    return Promise.all(items.map(async n => {
      try {
        const [titulo, desc] = await Promise.all([
          translate(n.titulo || '').catch(() => n.titulo),
          translate(n.desc   || '').catch(() => n.desc),
        ]);
        return { ...n, titulo, desc };
      } catch { return n; }
    }));
  }

  // ── Helpers de formato ────────────────────────────────────
  function fmtPct(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return '';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  // ── Backend Local: Datos BMV (Evitando caché para tiempo real) ──
  async function bmvMarket() {
    const r = await safeFetch(`/api/bmv-market?t=${Date.now()}`);
    return await r.json();
  }

  // ── Exportar reportes a Word ────────────────────────────────
  // Genera un .doc (HTML con namespaces de Word, MIME application/msword) que
  // Word abre nativamente — no requiere librerías ni backend.
  function _escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Gráficas (Chart.js, cargado bajo demanda) ──────────────────────────
     Se usa tanto para las gráficas en vivo del chatbox como para renderizarlas
     como PNG offscreen al exportar un reporte a Word (que no puede ejecutar JS). */
  let _chartJsPromise = null;
  function ensureChartJs() {
    if (typeof window.Chart !== 'undefined') return Promise.resolve();
    if (_chartJsPromise) return _chartJsPromise;
    _chartJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/js/vendor/chart.umd.js?v=1';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
      document.head.appendChild(s);
    });
    return _chartJsPromise;
  }

  const _CHART_PALETTE = ['#00213a', '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
  const _CHART_TYPES   = new Set(['bar', 'line', 'pie', 'doughnut', 'radar']);

  // Construye un Chart.js sobre un <canvas> ya presente en el DOM a partir de un spec
  // { type, title, labels, datasets:[{label,data}] } — usado en vivo y para exportar a PNG.
  function buildChart(canvas, spec, extraOptions = {}) {
    if (typeof window.Chart === 'undefined' || !canvas || !spec) return null;
    const type    = _CHART_TYPES.has(spec.type) ? spec.type : 'bar';
    const isSlice = type === 'pie' || type === 'doughnut';
    const labels  = (spec.labels || []).slice(0, 24).map(l => String(l).slice(0, 30));
    const datasets = (spec.datasets || []).slice(0, 6).map((ds, i) => {
      const color = _CHART_PALETTE[i % _CHART_PALETTE.length];
      return {
        label: String(ds.label || `Serie ${i + 1}`).slice(0, 60),
        data: (ds.data || []).slice(0, 24).map(v => { const n = Number(v); return isNaN(n) ? 0 : n; }),
        backgroundColor: isSlice ? _CHART_PALETTE : color + (type === 'line' ? '26' : 'cc'),
        borderColor: isSlice ? '#fff' : color,
        borderWidth: type === 'line' ? 2 : 1,
        tension: .3,
        fill: type === 'line',
        borderRadius: type === 'bar' ? 4 : 0,
      };
    });
    try {
      return new window.Chart(canvas.getContext('2d'), {
        type,
        data: { labels, datasets },
        options: Object.assign({
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400 },
          plugins: {
            legend: { display: datasets.length > 1 || isSlice, labels: { font: { size: 10, family: 'Inter' }, color: '#334155', boxWidth: 10 } },
          },
          scales: isSlice ? {} : {
            x: { ticks: { font: { size: 9, family: 'Inter' }, color: '#64748b' }, grid: { display: false } },
            y: { ticks: { font: { size: 9, family: 'Inter' }, color: '#64748b' }, grid: { color: 'rgba(0,33,58,.06)' } },
          },
        }, extraOptions),
      });
    } catch { return null; }
  }

  // Renderiza un spec de gráfica en un <canvas> offscreen y devuelve un PNG en base64 —
  // así se puede insertar como <img> en el reporte de Word (que no ejecuta JS/canvas).
  async function renderChartToPngDataUrl(spec) {
    try {
      await ensureChartJs();
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 340;
      canvas.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(canvas);
      const chart = buildChart(canvas, spec, { animation: false, responsive: false });
      if (!chart) { canvas.remove(); return null; }
      await new Promise(r => setTimeout(r, 50)); // deja un tick para que Chart.js termine de pintar
      const url = canvas.toDataURL('image/png');
      chart.destroy();
      canvas.remove();
      return url;
    } catch { return null; }
  }

  // Convierte texto con markdown ligero (títulos ###, **negritas**, listas,
  // tablas | col | col |) a HTML válido para Word — así un reporte con
  // estructura real (secciones, cifras resaltadas, comparativas en tabla) se
  // ve como un documento ejecutivo y no como un bloque de texto plano con <br>.
  async function _mdToWordHtml(text) {
    let esc = _escHtml(String(text));

    // Gráficas ```chart {json}``` → placeholder; se renderizan como PNG (Chart.js offscreen)
    // al final, porque Word no puede ejecutar JS/canvas — necesita una imagen ya rasterizada.
    const chartSpecs = [];
    esc = esc.replace(/```chart\s*\n([\s\S]*?)```/g, (_, raw) => {
      const jsonStr = raw.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      let spec;
      try { spec = JSON.parse(jsonStr); } catch { return ''; }
      if (!spec || !Array.isArray(spec.labels) || !Array.isArray(spec.datasets) || !spec.datasets.length) return '';
      chartSpecs.push(spec);
      return `@@VN_DOC_CHART_${chartSpecs.length - 1}@@`;
    });

    // Tablas markdown → <table>
    const tables = [];
    esc = esc.replace(/^(\|.*\|[ \t]*\n\|?[ \t:-]+\|[ \t:|-]*\n(?:\|.*\|[ \t]*\n?)+)/gm, (block) => {
      const rows = block.trim().split('\n').map(r => r.trim());
      const header = rows[0].replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const bodyRows = rows.slice(2).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      let html = '<table style="border-collapse:collapse;width:100%;margin:10pt 0;font-size:10pt;"><thead><tr>'
        + header.map(h => `<th style="border:1px solid #cbd5e1;background:#f1f5f9;color:#00213A;padding:5pt 8pt;text-align:left;">${h}</th>`).join('')
        + '</tr></thead><tbody>';
      bodyRows.forEach(r => { html += '<tr>' + r.map(c => `<td style="border:1px solid #e2e8f0;padding:5pt 8pt;">${c}</td>`).join('') + '</tr>'; });
      html += '</tbody></table>';
      tables.push(html);
      return `@@VN_DOC_TABLE_${tables.length - 1}@@`;
    });

    // Encabezados ### y ## → <h3>/<h2> con acento de marca
    esc = esc
      .replace(/^##\s+(.+)$/gm, '<h2 style="font-size:14pt;color:#00213A;border-bottom:1pt solid #dbe2ea;padding-bottom:4pt;margin:18pt 0 8pt;">$1</h2>')
      .replace(/^###\s+(.+)$/gm, '<h3 style="font-size:12pt;color:#00213A;border-left:3pt solid #00213A;padding-left:8pt;margin:14pt 0 6pt;">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#00213A;">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Listas: agrupar líneas consecutivas de "- item" / "1. item" en <ul>/<ol>
    const lines = esc.split('\n');
    const out = [];
    let listBuf = [], listType = null;
    const flushList = () => {
      if (!listBuf.length) return;
      const tag = listType === 'ol' ? 'ol' : 'ul';
      out.push(`<${tag} style="margin:6pt 0;padding-left:20pt;">` + listBuf.map(li => `<li style="margin:2pt 0;">${li}</li>`).join('') + `</${tag}>`);
      listBuf = []; listType = null;
    };
    for (const line of lines) {
      const ol = line.match(/^[ \t]*\d+\.\s+(.+)/);
      const ul = line.match(/^[ \t]*[-•]\s+(.+)/);
      if (ol) { if (listType && listType !== 'ol') flushList(); listType = 'ol'; listBuf.push(ol[1]); }
      else if (ul) { if (listType && listType !== 'ul') flushList(); listType = 'ul'; listBuf.push(ul[1]); }
      else { flushList(); out.push(line); }
    }
    flushList();

    // Párrafos: líneas en blanco separan <p>; una sola línea = <br> dentro del mismo párrafo
    let html = out.join('\n')
      .split(/\n{2,}/)
      .map(block => {
        if (/^<(h2|h3|ul|ol|table|@@)/.test(block.trim())) return block; // ya es HTML de bloque
        return block.trim() ? `<p style="margin:0 0 10pt;">${block.replace(/\n/g, '<br>')}</p>` : '';
      })
      .join('\n');

    html = tables.reduce((h, t, i) => h.replace(`@@VN_DOC_TABLE_${i}@@`, t), html);

    if (chartSpecs.length) {
      const images = await Promise.all(chartSpecs.map(spec => renderChartToPngDataUrl(spec)));
      images.forEach((dataUrl, i) => {
        const chartTitle = chartSpecs[i]?.title ? _escHtml(String(chartSpecs[i].title).slice(0, 120)) : '';
        const block = dataUrl
          ? `<div style="margin:14pt 0;text-align:center;">${chartTitle ? `<div style="font-size:10pt;font-weight:700;color:#00213A;margin-bottom:6pt;">${chartTitle}</div>` : ''}<img src="${dataUrl}" style="max-width:100%;border:1px solid #dbe2ea;border-radius:6px;" /></div>`
          : '';
        html = html.replace(`@@VN_DOC_CHART_${i}@@`, block);
      });
    }

    return html;
  }

  async function downloadAsWord(filename, content, opts = {}) {
    const title = opts.title || 'Reporte VALLNews';
    const stamp = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const bodyHtml = await _mdToWordHtml(content);
    const html = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${_escHtml(title)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.55;color:#1a1a2e;max-width:680px;margin:0 auto;">
<div style="border-bottom:3pt solid #00213A;padding-bottom:12pt;margin-bottom:16pt;">
  <div style="font-size:9pt;font-weight:bold;letter-spacing:2px;color:#00213A;text-transform:uppercase;">VALLNews &middot; Inteligencia Econ&oacute;mica</div>
  <div style="font-size:19pt;font-weight:bold;color:#00213A;margin:5pt 0 2pt;">${_escHtml(title)}</div>
  <div style="font-size:9pt;color:#64748b;">Generado por VALL-AI &middot; ${stamp}</div>
</div>
<div>${bodyHtml}</div>
<div style="margin-top:22pt;padding-top:9pt;border-top:1pt solid #dbe2ea;font-size:8pt;color:#94a3b8;">
  Documento generado autom&aacute;ticamente por VALL-AI a partir de datos en tiempo real de VALLNews. Uso informativo &mdash; no constituye asesor&iacute;a financiera formal.
</div>
</body></html>`;
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = /\.docx?$/i.test(filename) ? filename : filename + '.doc';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── API pública ───────────────────────────────────────────
  async function gdeltImages(query, maxrecords = 5) {
    if (!query) return [];
    const key = `gdeltimg_${query}_${maxrecords}`;
    const c = load(key);
    if (c !== null) return c;
    const qs = new URLSearchParams({ query, mode: 'imagecollageinfo', maxrecords });
    try {
      const r = await safeFetch(`/api/gdelt?${qs}`, {}, 16000);
      const j = await r.json();
      const urls = (j?.images || []).map(i => i.url).filter(u => u?.startsWith('http'));
      if (urls.length) save(key, urls);
      return urls;
    } catch { return []; }
  }

  return {
    usdmxn,
    commodity,
    commodityWithPct,
    quote,
    banxico,
    newsAlphaVantage,
    finnhubNews,
    gdeltNews,
    gdeltImages,
    translate,
    translateNews,
    gemini,
    geminiChat,
    bmvMarket,
    downloadAsWord,
    ensureChartJs,
    buildChart,
    renderChartToPngDataUrl,
    fmtPct,
    load,
    isExpired,
    save,
    clear,
    TTL
  };
})();
