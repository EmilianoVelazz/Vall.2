
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
      // Usa el proxy del backend en vez de llamar directamente a la API externa
      const r = await safeFetch('/api/exchange-rates');
      const j = await r.json();
      const v = j?.rates?.MXN;
      if (v) { save(key, v); return v; }
    } catch {}
    return load(key, true); // stale-ok si la API falla
  }

  const _MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Detecta solicitudes explícitas de una gráfica histórica USD/MXN. También
  // corrige errores comunes de captura como "20222" cuando al quitar un dígito
  // repetido se obtiene un año válido ("2022").
  function historicalUsdMxnYear(question) {
    const text = String(question || '');
    const wantsChart = /\b(gr[aá]fica|gr[aá]fico|graficar|chart|visualiza)/i.test(text);
    const mentionsUsd = /\b(?:usd(?:\/?mxn)?|d[oó]lar(?:es)?)\b/i.test(text);
    const mentionsMxn = /\b(?:mxn|peso(?:s)?(?:\s+mexican(?:o|os|a|as))?)\b/i.test(text);
    if (!wantsChart || !mentionsUsd || !mentionsMxn) return null;

    const currentYear = new Date().getFullYear();
    const validYear = value => Number.isInteger(value) && value >= 1970 && value <= currentYear;
    const direct = text.match(/\b(?:19|20)\d{2}\b/);
    if (direct && validYear(Number(direct[0]))) return Number(direct[0]);

    const typo = text.match(/\b(?:19|20)\d{3}\b/);
    if (!typo) return null;
    const digits = typo[0];
    for (let index = 1; index < digits.length; index++) {
      if (digits[index] !== digits[index - 1]) continue;
      const candidate = Number(digits.slice(0, index) + digits.slice(index + 1));
      if (validYear(candidate)) return candidate;
    }
    return null;
  }

  // Devuelve una especificación Chart.js con cierres mensuales reales de
  // Yahoo Finance. El ticker MXN=X representa pesos mexicanos por dólar.
  async function historicalUsdMxnChartSpec(question) {
    const year = historicalUsdMxnYear(question);
    if (!year) return null;
    const key = `fx_usdmxn_monthly_${year}`;
    const cached = load(key);
    if (cached?.labels?.length && cached?.datasets?.[0]?.data?.length) return cached;

    const currentYear = new Date().getFullYear();
    const range = year >= currentYear - 9 ? '10y' : 'max';
    try {
      const params = new URLSearchParams({ ticker: 'MXN=X', interval: '1mo', range });
      const response = await safeFetch(`/api/stock-history?${params}`, {}, 14000);
      if (!response.ok) return null;
      const payload = await response.json();
      const monthly = new Map();
      (payload?.candles || []).forEach(candle => {
        const date = String(candle?.time || '');
        if (!date.startsWith(`${year}-`)) return;
        const month = Number(date.slice(5, 7)) - 1;
        const close = Number(candle?.close);
        if (month < 0 || month > 11 || !Number.isFinite(close)) return;
        monthly.set(month, +close.toFixed(4));
      });
      if (monthly.size < 2) return null;
      const months = [...monthly.keys()].sort((a, b) => a - b);
      const spec = {
        type: 'line',
        title: `USD/MXN — cierre mensual en ${year}`,
        subtitle: 'Pesos mexicanos por dólar estadounidense',
        insight: 'La línea muestra el cierre de cada mes disponible durante el año solicitado.',
        unit: 'MXN por USD',
        source: 'Yahoo Finance · ticker MXN=X',
        beginAtZero: false,
        labels: months.map(month => _MONTHS_ES[month]),
        datasets: [{ label: 'USD/MXN', data: months.map(month => monthly.get(month)) }],
      };
      save(key, spec);
      return spec;
    } catch {
      return load(key, true);
    }
  }
  // DEPRECATED: commodity() llamaba directamente a Alpha Vantage desde el cliente.
  // Usa commodityWithPct() que pasa por el backend proxy /api/commodity.
  async function commodity(fn) { return null; }

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
  // DEPRECATED: quote() llamaba directamente a Alpha Vantage desde el cliente.
  // Los datos de mercado ahora vienen por /api/bmv-market (Yahoo Finance proxy).
  async function quote(symbol) { return null; }
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

  const _AI_COMMODITIES = {
    maiz: 'CORN', maíz: 'CORN', corn: 'CORN',
    soya: 'SOYBEANS', soja: 'SOYBEANS', soybean: 'SOYBEANS',
    trigo: 'WHEAT', wheat: 'WHEAT',
    petroleo: 'CRUDE_OIL', petróleo: 'CRUDE_OIL', wti: 'CRUDE_OIL', crudo: 'CRUDE_OIL', oil: 'CRUDE_OIL',
    cobre: 'COPPER', copper: 'COPPER',
    'gas natural': 'NATURAL_GAS',
    aluminio: 'ALUMINUM', aluminum: 'ALUMINUM',
  };
  const _AI_COMMODITY_LABELS = {
    CORN: 'Maíz', SOYBEANS: 'Soya', WHEAT: 'Trigo', CRUDE_OIL: 'Petróleo WTI',
    COPPER: 'Cobre', NATURAL_GAS: 'Gas natural', ALUMINUM: 'Aluminio',
  };
  const _AI_COMMODITY_UNITS = {
    CORN: 'USD/bu', SOYBEANS: 'USD/MT', WHEAT: 'USD/bu', CRUDE_OIL: 'USD/bbl',
    COPPER: 'USD/lb', NATURAL_GAS: 'USD/MMBtu', ALUMINUM: 'USD/MT',
  };

  function detectAiDataIntents(question) {
    const text = String(question || '').toLowerCase();
    const intents = [];
    const add = value => { if (!intents.includes(value)) intents.push(value); };
    if (/\b(d[oó]lar|usd|mxn|peso mexicano|tipo de cambio|divisa|forex)\b/i.test(text)) add('currency');
    if (/\b(tasa|tasas|banxico|tiie|cetes|udibono|bono|bonos|rendimiento|fed|banco central)\b/i.test(text)) add('rates');
    if (/\b(acci[oó]n|acciones|bolsa|bmv|ipc|gruma|bimbo|femsa|walmex|mercado burs[aá]til)\b/i.test(text)) add('equities');
    if (/\b(commodity|commodities|materia prima|ma[ií]z|soya|soja|trigo|petr[oó]leo|wti|crudo|cobre|gas natural|aluminio)\b/i.test(text)) add('commodities');
    if (/\b(cripto|crypto|bitcoin|btc|ethereum|eth)\b/i.test(text)) add('crypto');
    if (/\b(noticia|noticias|hoy|actual|reciente|evento|titular)\b/i.test(text)) add('news');
    if (/\b(geopol[ií]tica|guerra|conflicto|sanci[oó]n|arancel|ucrania|rusia|china|medio oriente|israel|iran|ir[aá]n)\b/i.test(text)) add('geopolitics');
    if (/\b(m[eé]xico|econom[ií]a mexicana|mercado mexicano)\b/i.test(text)) add('mexico');
    if (/\b(panorama|mercados|resumen financiero|econom[ií]a global)\b/i.test(text)) add('market');
    return intents;
  }

  function _aiRequestedCommodities(question, broad = false) {
    const normalized = String(question || '').toLowerCase();
    const selected = [];
    Object.entries(_AI_COMMODITIES).forEach(([term, code]) => {
      if (normalized.includes(term) && !selected.includes(code)) selected.push(code);
    });
    if (!selected.length && broad) return ['CORN', 'CRUDE_OIL', 'COPPER'];
    return selected.slice(0, 3);
  }

  async function _aiApiJson(url, ms = 9000) {
    const response = await safeFetch(url, { credentials: 'include' }, ms);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function _aiClean(value, max = 180) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function _aiNumber(value, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('es-MX', { maximumFractionDigits: digits }) : '—';
  }

  function _aiWithDeadline(promise, ms = 7000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms);
      Promise.resolve(promise).then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); }
      );
    });
  }

  // Agrega contexto compacto según la intención de la pregunta. Cada fuente se
  // consulta de forma independiente para que una API caída no bloquee al chat.
  async function aiDataContext(question) {
    const intents = detectAiDataIntents(question);
    const intentSet = new Set(intents);
    const tasks = [];
    const addTask = (name, run, timeout = 7000) => tasks.push({ name, run, timeout });
    const wants = name => intentSet.has(name);
    const wantsMarket = wants('market') || wants('mexico');

    if (wantsMarket || wants('currency') || wants('equities') || wants('crypto') || wants('commodities')) {
      addTask('Yahoo Finance / BMV', async () => {
        const data = await bmvMarket();
        const assets = [...(data?.bmv || []), ...(data?.porcino || []), ...(data?.gasolina || []), ...(data?.crypto || [])];
        const filtered = assets.filter(asset => {
          if (wantsMarket) return true;
          if (wants('currency') && asset.type === 'currency') return true;
          if (wants('equities') && asset.type === 'stock') return true;
          if (wants('crypto') && asset.type === 'crypto') return true;
          return wants('commodities') && asset.type === 'commodity';
        }).slice(0, 10);
        if (!filtered.length) return '';
        return `Yahoo Finance/BMV (${data.timestamp || new Date().toISOString()}): `
          + filtered.map(asset => `${asset.name} ${_aiNumber(asset.price)} (${fmtPct(asset.change_pct)})`).join('; ');
      });
    }

    if (wants('currency') || wantsMarket) {
      addTask('Tipos de cambio', async () => {
        const data = await _aiApiJson('/api/exchange-rates');
        const rates = data?.rates || {};
        const date = data?.time_last_update_utc || data?.time_last_update_unix || 'corte actual';
        return `Open Exchange Rates (${date}): 1 USD = ${_aiNumber(rates.MXN, 4)} MXN; ${_aiNumber(rates.EUR, 4)} EUR; ${_aiNumber(rates.CAD, 4)} CAD.`;
      });
      addTask('Banxico FIX', async () => {
        const value = await banxico('SF43718');
        return Number.isFinite(Number(value)) ? `Banxico SIE FIX: ${_aiNumber(value, 4)} MXN por USD.` : '';
      });
    }

    if (wants('rates') || wantsMarket) {
      addTask('Tasas México', async () => {
        const data = await _aiApiJson('/api/mx-rates');
        const coherent = items => {
          const valid = (items || []).filter(item => Number.isFinite(Number(item.yield)) && Number(item.yield) >= 0 && Number(item.yield) <= 30);
          if (valid.length < 3) return valid;
          const sorted = valid.map(item => Number(item.yield)).sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          return valid.filter(item => Math.abs(Number(item.yield) - median) <= Math.max(3, median * .35));
        };
        const tiie = coherent(data?.tiie).map(item => `TIIE ${item.label} ${_aiNumber(item.yield)}%`).join(', ');
        const cetes = coherent(data?.cetes).map(item => `CETES ${item.label} ${_aiNumber(item.yield)}%`).join(', ');
        const udis = (data?.udibonos || []).map(item => `UDIBONO ${item.label} ${_aiNumber(item.realYield)}% real`).join(', ');
        return `Banxico (${data?.date || 'corte actual'}): ${[tiie, cetes, udis].filter(Boolean).join('; ')}.`;
      });
      addTask('Bonos globales', async () => {
        const countries = await _aiApiJson('/api/bond-yields');
        const rows = (Array.isArray(countries) ? countries : []).slice(0, 8).map(country => {
          const tenYear = country.bonds?.find(bond => bond.maturity === '10Y') || country.bonds?.[0];
          return tenYear ? `${country.country} ${tenYear.label || tenYear.maturity}: ${_aiNumber(tenYear.yield)}%` : '';
        }).filter(Boolean);
        return rows.length ? `Bonos soberanos (${new Date().toISOString()}): ${rows.join('; ')}.` : '';
      });
    }

    const commodityCodes = _aiRequestedCommodities(question, wants('market') || wants('commodities'));
    commodityCodes.forEach(code => addTask(`Commodity ${code}`, async () => {
      const data = await commodityWithPct(code);
      if (!data || !Number.isFinite(Number(data.price))) return '';
      return `Alpha Vantage — ${_AI_COMMODITY_LABELS[code]}: ${_aiNumber(data.price, 4)} ${_AI_COMMODITY_UNITS[code]}; variación mensual ${fmtPct(data.pct)}; variación 3 meses ${fmtPct(data.pct3m)}.`;
    }));

    if (wants('crypto')) {
      addTask('Cripto global', async () => {
        const data = (await _aiApiJson('/api/crypto-global'))?.data || {};
        return `CoinGecko (${new Date().toISOString()}): capitalización global USD ${_aiNumber(data.total_market_cap?.usd, 0)}; volumen 24h USD ${_aiNumber(data.total_volume?.usd, 0)}; dominio BTC ${_aiNumber(data.market_cap_percentage?.btc)}%; cambio 24h ${fmtPct(data.market_cap_change_percentage_24h_usd)}.`;
      });
    }

    if (wants('news') || wants('geopolitics') || wants('currency')) {
      const category = wants('crypto') ? 'crypto' : wants('currency') ? 'forex' : 'general';
      addTask('Finnhub noticias', async () => {
        const items = await finnhubNews(category);
        const headlines = (items || []).slice(0, 4).map(item =>
          `${_aiClean(item.title)} — ${_aiClean(item.source, 60)} (${item.publishedAt || 'sin fecha'})`
        ).filter(Boolean);
        return headlines.length ? `Finnhub noticias: ${headlines.join('; ')}.` : '';
      });
    }

    if (wants('geopolitics') || (wants('news') && !wants('crypto') && !wants('currency'))) {
      const query = wants('geopolitics') ? 'geopolitics Mexico economy conflict' : 'Mexico economy markets';
      addTask('GDELT noticias', async () => {
        const items = await gdeltNews(query, 4);
        const headlines = (items || []).slice(0, 4).map(item =>
          `${_aiClean(item.title)} — ${_aiClean(item.source, 60)} (${item.publishedAt || 'sin fecha'})`
        ).filter(Boolean);
        return headlines.length ? `GDELT: ${headlines.join('; ')}.` : '';
      }, 5000);
    }

    if (wants('commodities') || (wants('news') && !wants('crypto') && !wants('currency'))) {
      const topic = wants('commodities') ? 'commodities' : 'financial_markets';
      addTask('Alpha Vantage noticias', async () => {
        const items = await newsAlphaVantage(topic, 4);
        const headlines = (items || []).slice(0, 4).map(item =>
          `${_aiClean(item.title)} — ${_aiClean(item.source, 60)} (${item.publishedAt || 'sin fecha'})`
        ).filter(Boolean);
        return headlines.length ? `Alpha Vantage noticias: ${headlines.join('; ')}.` : '';
      }, 5000);
    }

    const settled = await Promise.allSettled(tasks.map(task => _aiWithDeadline(task.run(), task.timeout)));
    const lines = settled
      .map((result, index) => result.status === 'fulfilled' && result.value ? result.value : '')
      .filter(Boolean);
    if (!lines.length) return '';
    return [
      '[DATOS VERIFICADOS DE APIS INTERNAS]',
      `Fecha de consulta: ${new Date().toISOString()}`,
      `Intenciones detectadas: ${intents.join(', ')}`,
      ...lines,
      'Usa únicamente estas cifras como datos actuales. Conserva fecha, unidad y fuente; si una fuente no aparece, no asumas que respondió.',
      '[FIN DATOS VERIFICADOS]',
    ].join('\n');
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
      s.src = '/assets/js/vendor/chart.umd.js?v=2';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
      document.head.appendChild(s);
    });
    return _chartJsPromise;
  }

  const _CHART_PALETTE = ['#00213a', '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
  const _CHART_TYPES   = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea']);

  // Construye un Chart.js sobre un <canvas> ya presente en el DOM a partir de un spec
  // { type, title, labels, datasets:[{label,data}] } — usado en vivo y para exportar a PNG.
  function buildChart(canvas, spec, extraOptions = {}) {
    if (typeof window.Chart === 'undefined' || !canvas || !spec) return null;
    const type    = _CHART_TYPES.has(spec.type) ? spec.type : 'bar';
    const isSlice = type === 'pie' || type === 'doughnut' || type === 'polarArea';
    const labels  = (spec.labels || []).slice(0, 24).map(l => String(l).slice(0, 30));
    const datasets = (spec.datasets || []).slice(0, 6).map((ds, i) => {
      const color = _CHART_PALETTE[i % _CHART_PALETTE.length];
      return {
        label: String(ds.label || `Serie ${i + 1}`).slice(0, 60),
        type: _CHART_TYPES.has(ds.type) && !isSlice ? ds.type : undefined,
        data: (ds.data || []).slice(0, 24).map(v => { const n = Number(v); return isNaN(n) ? 0 : n; }),
        backgroundColor: isSlice ? _CHART_PALETTE : color + (type === 'line' ? '26' : 'cc'),
        borderColor: isSlice ? '#fff' : color,
        borderWidth: (type === 'line' || ds.type === 'line') ? 2.4 : 1,
        tension: .3,
        fill: (type === 'line' || ds.type === 'line') ? Boolean(spec.fillArea) : false,
        pointRadius: (type === 'line' || ds.type === 'line') ? 2.5 : 0,
        pointHoverRadius: (type === 'line' || ds.type === 'line') ? 5 : 0,
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
          indexAxis: spec.indexAxis === 'y' ? 'y' : 'x',
          scales: isSlice || type === 'radar' || type === 'polarArea' ? {} : {
            x: { ticks: { font: { size: 9, family: 'Inter' }, color: '#64748b' }, grid: { display: false } },
            y: { beginAtZero: Boolean(spec.beginAtZero), ticks: { font: { size: 9, family: 'Inter' }, color: '#64748b' }, grid: { color: 'rgba(0,33,58,.06)' } },
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

  // Convierte una tabla Markdown o una lista de datos escrita por el usuario en
  // una especificación de gráfica. Es el respaldo determinista cuando el modelo
  // explica cómo graficar, pero olvida emitir el bloque ```chart solicitado.
  function chartSpecFromText(answerText, questionText = '') {
    const answer = String(answerText || '');
    const question = String(questionText || '');
    const number = (value) => {
      const cleaned = String(value).replace(/[%$€£\s]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
      const parsed = Number(cleaned); return Number.isFinite(parsed) ? parsed : null;
    };
    const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map(v => v.trim());
    const tableLines = answer.split(/\r?\n/).filter(line => (line.match(/\|/g) || []).length >= 2);
    if (tableLines.length >= 3) {
      const headers = cells(tableLines[0]);
      const rows = tableLines.slice(1).filter(line => !/^\s*\|?\s*:?-{2,}/.test(line)).map(cells).filter(row => row.length >= 2);
      if (headers.length >= 2 && rows.length >= 2) {
        const labels = rows.map(row => row[0]).filter(Boolean);
        const datasets = headers.slice(1).map((header, col) => ({
          label: header || `Serie ${col + 1}`,
          data: rows.map(row => number(row[col + 1])),
        })).filter(set => set.data.filter(v => v != null).length >= 2);
        if (labels.length >= 2 && datasets.length) {
          return { type: 'line', title: 'Visualización de los datos analizados', subtitle: 'Gráfica generada automáticamente a partir de la tabla de la respuesta', unit: /%|porcentaje/i.test(answer + question) ? '%' : '', source: 'Tabla incluida en la respuesta de VALL AI', labels, datasets };
        }
      }
    }

    const segments = question.split(';').map(value => value.trim()).filter(Boolean);
    const labelSegment = segments.find(value => /\b(?:meses|periodos|a[nñ]os|categor[ií]as)\b/i.test(value));
    if (!labelSegment) return null;
    const labels = labelSegment.replace(/^.*?\b(?:meses|periodos|a[nñ]os|categor[ií]as)\s*:?[\s]*/i, '').split(',').map(value => value.trim()).filter(Boolean);
    if (labels.length < 2) return null;
    const datasets = [];
    segments.forEach(segment => {
      if (segment === labelSegment) return;
      const values = segment.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      if (values.length !== labels.length) return;
      const firstNumber = segment.search(/-?\d/);
      const label = segment.slice(0, firstNumber).replace(/[:,-]+$/g, '').trim();
      if (label) datasets.push({ label: label.slice(0, 70), data: values });
    });
    if (!datasets.length) return null;
    const mixed = /mixta|combinad/i.test(question);
    if (mixed) datasets.forEach((set, index) => { set.type = index % 2 ? 'line' : 'bar'; });
    return { type: mixed ? 'bar' : 'line', title: 'Gráfica solicitada por el usuario', subtitle: 'Visualización construida con los valores proporcionados en la consulta', unit: /%|porcentaje/i.test(question) ? '%' : '', source: 'Datos proporcionados por el usuario', labels, datasets };
  }

  async function renderMermaidToPngDataUrl(source) {
    try {
      if (!window.mermaid || !source) return null;
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', suppressErrorRendering: true });
      const id = `vn-doc-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { svg } = await window.mermaid.render(id, source);
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      try {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = svgUrl; });
        const canvas = document.createElement('canvas');
        const maxWidth = 1100;
        const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth || 900));
        canvas.width = Math.max(640, Math.round((image.naturalWidth || 900) * scale));
        canvas.height = Math.max(300, Math.round((image.naturalHeight || 500) * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      } finally { URL.revokeObjectURL(svgUrl); }
    } catch { return null; }
  }

  // Convierte texto con markdown ligero (títulos ###, **negritas**, listas,
  // tablas | col | col |) a HTML válido para Word — así un reporte con
  // estructura real (secciones, cifras resaltadas, comparativas en tabla) se
  // ve como un documento ejecutivo y no como un bloque de texto plano con <br>.
  async function _mdToWordHtml(text) {
    let esc = _escHtml(String(text));

    // Diagramas Mermaid → PNG para que Word no dependa de JavaScript.
    const diagramSpecs = [];
    esc = esc.replace(/```mermaid\s*\n([\s\S]*?)```/g, (_, raw) => {
      const source = raw.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      diagramSpecs.push(source);
      return `@@VN_DOC_DIAGRAM_${diagramSpecs.length - 1}@@`;
    });

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

    if (diagramSpecs.length) {
      const images = await Promise.all(diagramSpecs.map(source => renderMermaidToPngDataUrl(source)));
      images.forEach((dataUrl, i) => {
        const block = dataUrl
          ? `<div style="margin:14pt 0;text-align:center;"><img src="${dataUrl}" style="max-width:100%;border:1px solid #dbe2ea;border-radius:6px;" /></div>`
          : `<pre style="white-space:pre-wrap;border:1px solid #dbe2ea;background:#f8fafc;padding:8pt;">${_escHtml(diagramSpecs[i])}</pre>`;
        html = html.replace(`@@VN_DOC_DIAGRAM_${i}@@`, block);
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
  function downloadElementAsWord(filename, element, opts = {}) {
    if (!element) throw new Error('No hay contenido para exportar.');
    const clone = element.cloneNode(true);
    const originalCanvases = element.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((canvas, index) => {
      try {
        const image = document.createElement('img');
        image.src = originalCanvases[index].toDataURL('image/png', 1);
        image.style.cssText = 'display:block;max-width:100%;margin:12pt auto;';
        canvas.replaceWith(image);
      } catch { canvas.remove(); }
    });
    clone.querySelectorAll('button,.vai-response-actions,.vai-chart-tools,.vn-msg-actions').forEach(node => node.remove());
    const title = _escHtml(opts.title || 'Reporte VALL AI');
    const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.55;color:#1a2b3a;max-width:720px;margin:24pt auto}h1,h2,h3{color:#00213a}h2{border-bottom:1pt solid #dbe2ea;padding-bottom:4pt}table{border-collapse:collapse;width:100%}th,td{border:1pt solid #dbe2ea;padding:5pt;text-align:left}th{background:#eef3f6}pre{white-space:pre-wrap;background:#071827;color:#eef6fb;padding:9pt}.vai-chart-card,.vn-chart-wrap{border:1pt solid #dbe2ea;padding:8pt;margin:10pt 0}.vai-chart-kpis{display:table;width:100%}.vai-chart-kpis>div{display:table-cell;padding:5pt}</style></head><body><div style="border-bottom:3pt solid #00213a;padding-bottom:10pt;margin-bottom:14pt"><div style="color:#9a762d;font-size:9pt;font-weight:bold;letter-spacing:1.5pt">VALLNEWS · INTELIGENCIA ECONÓMICA</div><h1 style="margin:5pt 0">${title}</h1><div style="color:#64748b;font-size:9pt">Generado por VALL AI · ${new Date().toLocaleDateString('es-MX')}</div></div>${clone.innerHTML}<p style="margin-top:20pt;border-top:1pt solid #dbe2ea;padding-top:8pt;color:#94a3b8;font-size:8pt">Documento informativo generado por VALL AI.</p></body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = /\.doc$/i.test(filename) ? filename : filename + '.doc';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

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
    downloadElementAsWord,
    ensureChartJs,
    buildChart,
    renderChartToPngDataUrl,
    chartSpecFromText,
    historicalUsdMxnYear,
    historicalUsdMxnChartSpec,
    detectAiDataIntents,
    aiDataContext,
    fmtPct,
    load,
    isExpired,
    save,
    clear,
    TTL
  };
})();
