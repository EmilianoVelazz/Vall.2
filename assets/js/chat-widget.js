/* ═══════════════════════════════════════════════════════════════
   VALL-AI  —  Chat Widget  v5.0
   Conversaciones múltiples (estilo Gemini/Claude) · Streaming en vivo
   Personalización adaptativa · Feedback
   ═══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* ── Config ─────────────────────────────────────── */
    const MAX_HISTORY   = 30;
    const MAX_INPUT     = 800;
    const MAX_CONVOS    = 40; // tope de conversaciones guardadas antes de descartar las más viejas
    const CONV_KEY      = 'vn_chat_conversations_v1'; // localStorage — lista de conversaciones {id, title, messages, updatedAt}
    const ACTIVE_KEY    = 'vn_chat_active_id_v1';      // localStorage — id de la conversación activa
    const UI_KEY         = 'vn_chat_ui_v1';             // sessionStorage — abierto/cerrado y última página (solo dentro de la pestaña)
    const OLD_SESSION_KEY = 'vn_chat_v2'; // formato anterior (una sola conversación) — se migra una vez
    const PROFILE_KEY   = 'vn_ai_profile'; // localStorage — persiste entre sesiones (aprendizaje ligero)
    const NEURON_KEY    = 'vn_ai_neuron';  // localStorage — estadísticas de qué ESTILO de respuesta gusta más
    const RESPONSE_MODE_KEY = 'vn_ai_response_mode';

    /* ── Páginas conocidas ──────────────────────────── */
    const PAGE_META = {
        finanzas:    { name: 'Finanzas',              sugs: ['¿Cómo está el tipo de cambio hoy?', '¿Qué indica el VIX actual?', 'Analiza el carry trade MXN'] },
        mercados:    { name: 'Mercados de Commodities', sugs: ['¿Cómo va el maíz hoy?', '¿Qué afecta al precio del petróleo?', 'Resumen de commodities clave'] },
        geopolitica: { name: 'Geopolítica',           sugs: ['¿Cuáles son los conflictos activos?', '¿Cómo afecta la geopolítica al peso?', 'Riesgo global actual'] },
        mexico:      { name: 'México',                sugs: ['¿Cómo va la inflación en México?', '¿Qué pasa con Banxico?', 'Situación del IPC mexicano'] },
        proteinas:   { name: 'Mercado de Proteínas',  sugs: ['¿Cómo va el precio del ganado?', '¿Tendencia del pollo y cerdo?', 'Mercado de proteínas hoy'] },
        inicio:      { name: 'Inicio',                sugs: ['¿Qué secciones tiene VALLNews?', '¿Cómo están los mercados hoy?', '¿Qué mueve al peso mexicano?'] },
        configuracion: { name: 'Configuración',       sugs: ['¿Cómo personalizo la plataforma?', '¿Qué es la mascota VALL-AI?', 'Explícame las secciones de VALLNews'] },
        default:     { name: 'VALLNews',              sugs: ['¿Cómo están los mercados hoy?', '¿Qué mueve al peso mexicano?', '¿Cuál es el panorama global?'] },
    };

    /* ── Detección de página (URL + título + DOM) ───── */
    function detectPage() {
        const path  = location.pathname.toLowerCase().replace(/\\/g, '/');
        const title = (document.title || '').toLowerCase();

        // URL path — más confiable
        if (/\/finanzas/.test(path))          return 'finanzas';
        if (/\/mercados/.test(path))          return 'mercados';
        if (/\/geopolit/.test(path))          return 'geopolitica';
        if (/\/mexico/.test(path))            return 'mexico';
        if (/\/proteina/.test(path))          return 'proteinas';
        if (/\/configur/.test(path))          return 'configuracion';
        if (/\/(inicio|index)/.test(path) || path === '/') return 'inicio';

        // Fallback: título del documento
        if (title.includes('finanzas'))       return 'finanzas';
        if (title.includes('mercados'))       return 'mercados';
        if (title.includes('geopolít') || title.includes('geopolitica')) return 'geopolitica';
        if (title.includes('méxico')   || title.includes('mexico'))      return 'mexico';
        if (title.includes('proteín')  || title.includes('proteina'))    return 'proteinas';
        if (title.includes('configur'))       return 'configuracion';
        if (title.includes('inicio'))         return 'inicio';

        // Fallback: buscar heading o clase específica en el DOM
        const h1 = (document.querySelector('h1, .page-title')?.textContent || '').toLowerCase();
        if (h1.includes('finanzas'))          return 'finanzas';
        if (h1.includes('mercado') && h1.includes('proteína')) return 'proteinas';
        if (h1.includes('mercado'))           return 'mercados';
        if (h1.includes('geopolít'))          return 'geopolitica';
        if (h1.includes('méxico'))            return 'mexico';

        return 'default';
    }

    /* ── Conversaciones: historial estilo Gemini/Claude ──────────
       En vez de un único hilo continuo, cada conversación es una entrada
       independiente {id, title, messages, updatedAt} guardada en localStorage.
       "Nuevo chat" archiva la actual y empieza una en blanco; el panel de
       historial permite volver a cualquiera o eliminarla individualmente. */
    function _loadConversations() {
        try {
            const raw = localStorage.getItem(CONV_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) { console.error('[VALL-AI] _loadConversations falló:', e); return []; }
    }
    function _saveConversations(list) {
        try { localStorage.setItem(CONV_KEY, JSON.stringify(list.slice(0, MAX_CONVOS))); }
        catch (e) { console.error('[VALL-AI] _saveConversations falló:', e); }
    }
    function _genTitle(messages) {
        const firstUser = messages.find(m => m.role === 'user' && !m._hidden);
        if (!firstUser) return 'Nueva conversación';
        const t = firstUser.text.trim().replace(/\s+/g, ' ');
        return t.length > 42 ? t.slice(0, 42) + '…' : t;
    }
    function _newConvId() { return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

    function _getActiveId() { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } }
    function _setActiveId(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {} }

    function _isChartRequest(text) {
        return /\b(gr[aá]fica|gr[aá]fico|graficar|chart|visualiza)/i.test(String(text || ''));
    }

    // Remove browser-generated charts saved before server-side source validation.
    function _sanitizeLegacyChartMessage(message, question) {
        if (!message || message.role !== 'model' || !_isChartRequest(question) || message.rich?.meta?.chartStatus) return false;
        let changed = false;
        const cleanText = String(message.text || '').replace(/```chart\s*\n[\s\S]*?```/gi, '').trim();
        if (cleanText !== String(message.text || '')) {
            message.text = cleanText;
            changed = true;
        }
        if (Array.isArray(message.rich?.blocks)) {
            const cleanBlocks = message.rich.blocks.filter((block) => block?.type !== 'chart');
            if (cleanBlocks.length !== message.rich.blocks.length) {
                message.rich.blocks = cleanBlocks;
                changed = true;
            }
        }
        return changed;
    }

    // Guarda (crea o actualiza) la conversación activa en la lista. No guarda conversaciones vacías.
    function _persistActiveConversation() {
        if (!activeConvId || !history.length) return;
        const list = _loadConversations();
        const idx = list.findIndex(c => c.id === activeConvId);
        const entry = { id: activeConvId, title: _genTitle(history), messages: history, updatedAt: Date.now() };
        if (idx === -1) list.unshift(entry); else list[idx] = entry;
        _saveConversations(list);
    }
    function _deleteConversation(id) { _saveConversations(_loadConversations().filter(c => c.id !== id)); }

    // Migra el formato anterior (una sola conversación en 'vn_chat_v2') la primera vez que se carga.
    function _migrateOldSession() {
        try {
            if (localStorage.getItem(CONV_KEY)) { localStorage.removeItem(OLD_SESSION_KEY); return; }
            const raw = localStorage.getItem(OLD_SESSION_KEY);
            if (raw) {
                const old = JSON.parse(raw);
                if (old?.history?.length) {
                    const conv = { id: _newConvId(), title: _genTitle(old.history), messages: old.history, updatedAt: old.ts || Date.now() };
                    _saveConversations([conv]);
                    _setActiveId(conv.id); // continuar la conversación migrada en vez de empezar una vacía
                }
            }
            localStorage.removeItem(OLD_SESSION_KEY);
        } catch (e) { console.error('[VALL-AI] _migrateOldSession falló:', e); }
    }
    _migrateOldSession();

    /* ── Estado de UI (abierto/cerrado, última página) ──────────
       Vive en sessionStorage: solo importa para reabrir automáticamente al
       navegar dentro de la misma pestaña, no debe sobrevivir a un cierre real
       del navegador (eso sí aplica al historial de conversaciones). */
    function _saveUiState() {
        try { sessionStorage.setItem(UI_KEY, JSON.stringify({ wasOpen: _isOpen, lastPage: detectPage() })); }
        catch (e) { console.error('[VALL-AI] _saveUiState falló:', e); }
    }
    function _loadUiState() {
        try { return JSON.parse(sessionStorage.getItem(UI_KEY)) || {}; }
        catch { return {}; }
    }

    /* ── Perfil de usuario: aprendizaje ligero en el cliente ──────
       No es una red neuronal — es un contador de frecuencia por tema que
       persiste en localStorage, igual que el historial. Con eso: (1) VALL-AI
       recibe una pista de qué temas le interesan más al usuario, y (2) sus
       quejas de "muy largo" bajan la extensión de las próximas respuestas.
       Simple, honesto y útil. */
    const TOPIC_KEYWORDS = {
        finanzas:    ['tipo de cambio', 'dólar', 'dolar', 'peso mexicano', 'tasa', 'tasas', 'inflación', 'inflacion', 'bono', 'bonos', 'vix', 'fed', 'banxico', 'divisa', 'carry trade'],
        mercados:    ['maíz', 'maiz', 'petróleo', 'petroleo', 'commodity', 'commodities', 'soya', 'trigo', 'café', 'cafe', 'gas natural', 'wti', 'brent'],
        geopolitica: ['geopolít', 'conflicto', 'sanción', 'sancion', 'arancel', 'guerra', 'tensión', 'tension', 'otan', 'sanciones'],
        mexico:      ['méxico', 'mexico', 'ipc', 'pib', 'remesas', 't-mec', 'tmec'],
        proteinas:   ['ganado', 'pollo', 'cerdo', 'carne', 'proteína', 'proteina', 'avícola', 'avicola', 'jamón'],
    };
    const TOPIC_LABELS = {
        finanzas:    { label: 'divisas y tasas',    q: '¿Cómo está el tipo de cambio y las tasas de interés hoy?' },
        mercados:    { label: 'commodities',        q: 'Dame un resumen de los commodities clave hoy' },
        geopolitica: { label: 'geopolítica',        q: '¿Cuáles son los riesgos geopolíticos más relevantes ahora?' },
        mexico:      { label: 'economía de México', q: '¿Cómo va la economía mexicana en general?' },
        proteinas:   { label: 'mercado de proteínas', q: '¿Cómo está el mercado de proteínas hoy?' },
    };

    function _loadProfile() {
        try {
            const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
            if (p && typeof p === 'object') return { topics: p.topics || {}, fb: p.fb || { up: 0, down: 0, downOnLong: 0 } };
        } catch {}
        return { topics: {}, fb: { up: 0, down: 0, downOnLong: 0 } };
    }
    function _saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} }

    function _trackTopic(text) {
        const low = text.toLowerCase();
        const p = _loadProfile();
        let matched = false;
        for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
            if (kws.some(k => low.includes(k))) { p.topics[topic] = (p.topics[topic] || 0) + 1; matched = true; }
        }
        if (matched) _saveProfile(p);
    }

    function _topInterest() {
        const p = _loadProfile();
        const entries = Object.entries(p.topics).sort((a, b) => b[1] - a[1]);
        return (entries.length && entries[0][1] >= 2) ? entries[0][0] : null;
    }

    function _trackFeedback(liked, responseLength) {
        const p = _loadProfile();
        if (liked) p.fb.up++;
        else { p.fb.down++; if (responseLength > 400) p.fb.downOnLong++; }
        _saveProfile(p);
    }

    // Si el usuario ha marcado 👎 varias respuestas largas, VALL-AI se vuelve más breve.
    function _concisenessHint() {
        const p = _loadProfile();
        const total = p.fb.up + p.fb.down;
        if (total >= 3 && p.fb.downOnLong >= 2 && p.fb.downOnLong / total > 0.4) {
            return 'El usuario ha indicado repetidamente que prefiere respuestas más breves y directas. Prioriza concisión salvo que pida explícitamente un análisis a fondo.';
        }
        return null;
    }

    /* ── "Neurona": aprendizaje por refuerzo simple sobre el ESTILO de
       respuesta ─────────────────────────────────────────────────────
       No es una red neuronal real — es honesto llamarlo así solo en el
       sentido de "una unidad que aprende de la experiencia": por cada 👍/👎
       se analiza CÓMO estaba escrita esa respuesta (¿tenía tabla? ¿lista?
       ¿encabezados? ¿negritas? ¿qué tan larga era?) y se lleva un marcador
       de aciertos/fallos por cada característica. Cuando un patrón tiene
       suficientes votos y una tendencia clara, se lo indica a Gemini como
       instrucción de estilo para la próxima respuesta — es decir, el propio
       comportamiento pasado del bot (y la reacción del usuario a él)
       entrena el comportamiento futuro. Todo vive en localStorage, nunca
       sale del navegador. */
    const NEURON_TRAITS = {
        hasTable:      'usar tablas para comparar datos',
        hasList:       'usar listas numeradas o con viñetas',
        hasHeaders:    'usar encabezados (###) para organizar la respuesta',
        hasBold:       'usar negritas para resaltar cifras clave',
        length_short:  'responder en 1-2 frases directas, sin rodeos',
        length_medium: 'responder con una explicación de tamaño medio',
        length_long:   'desarrollar un análisis largo y detallado',
    };
    const NEURON_MIN_VOTES_TRAIT = 3;  // votos mínimos por característica antes de confiar en el patrón
    const NEURON_MIN_VOTES_TOTAL = 3;  // votos totales mínimos antes de aplicar cualquier ajuste

    function _loadNeuron() {
        try {
            const n = JSON.parse(localStorage.getItem(NEURON_KEY));
            if (n && typeof n === 'object' && n.style) return n;
        } catch {}
        return { style: {}, votesTotal: 0 };
    }
    function _saveNeuron(n) { try { localStorage.setItem(NEURON_KEY, JSON.stringify(n)); } catch {} }

    function _analyzeStyle(text) {
        const len = text.length;
        return {
            hasTable:   /\|.*\|[ \t]*\n\|?[ \t:-]+\|/.test(text),
            hasList:    /^[ \t]*[-•][ \t]+\S/m.test(text) || /^[ \t]*\d+\.[ \t]+\S/m.test(text),
            hasHeaders: /^###\s+\S/m.test(text),
            hasBold:    (text.match(/\*\*[^*]+\*\*/g) || []).length >= 2,
            lengthKey:  len < 150 ? 'length_short' : len < 500 ? 'length_medium' : 'length_long',
        };
    }

    // Se llama cada vez que el usuario califica una respuesta con 👍/👎.
    function _recordNeuronFeedback(text, liked) {
        const n = _loadNeuron();
        const style = _analyzeStyle(text);
        const bump = (key) => {
            const s = n.style[key] || (n.style[key] = { up: 0, down: 0 });
            if (liked) s.up++; else s.down++;
        };
        if (style.hasTable)   bump('hasTable');
        if (style.hasList)    bump('hasList');
        if (style.hasHeaders) bump('hasHeaders');
        if (style.hasBold)    bump('hasBold');
        bump(style.lengthKey);
        n.votesTotal = (n.votesTotal || 0) + 1;
        _saveNeuron(n);
    }

    // Traduce las estadísticas acumuladas en instrucciones de estilo para Gemini.
    // Solo actúa sobre patrones con suficiente evidencia y una tendencia clara
    // (≥70% a favor o ≤30% a favor) — con poca muestra, no dice nada todavía.
    function _neuronHints() {
        const n = _loadNeuron();
        if ((n.votesTotal || 0) < NEURON_MIN_VOTES_TOTAL) return null;
        const favor = [], evitar = [];
        for (const [key, label] of Object.entries(NEURON_TRAITS)) {
            const s = n.style[key];
            if (!s) continue;
            const total = s.up + s.down;
            if (total < NEURON_MIN_VOTES_TRAIT) continue;
            const ratio = s.up / total;
            if (ratio >= 0.7) favor.push(label);
            else if (ratio <= 0.3) evitar.push(label);
        }
        if (!favor.length && !evitar.length) return null;
        const parts = [];
        if (favor.length)  parts.push(`Al usuario le ha gustado cuando VALL-AI: ${favor.join('; ')}.`);
        if (evitar.length) parts.push(`Al usuario NO le ha gustado cuando VALL-AI: ${evitar.join('; ')} — evita ese estilo salvo que la pregunta lo requiera explícitamente.`);
        return parts.join(' ');
    }

    // Resumen legible del aprendizaje acumulado, para mostrarlo en el panel de la neurona.
    function _neuronSummary() {
        const n = _loadNeuron();
        const total = n.votesTotal || 0;
        if (total < NEURON_MIN_VOTES_TOTAL) {
            return `Aún aprendiendo — llevas ${total} voto${total === 1 ? '' : 's'}. Califica algunas respuestas más (👍/👎) para que empiece a notar patrones.`;
        }
        const lines = [];
        for (const [key, label] of Object.entries(NEURON_TRAITS)) {
            const s = n.style[key];
            if (!s) continue;
            const t = s.up + s.down;
            if (t < NEURON_MIN_VOTES_TRAIT) continue;
            const ratio = Math.round((s.up / t) * 100);
            const icon = ratio >= 70 ? '✅' : ratio <= 30 ? '🚫' : '➖';
            lines.push(`${icon} ${label} — ${ratio}% de aprobación (${t} votos)`);
        }
        if (!lines.length) return `${total} votos registrados, pero aún ninguna característica tiene suficiente evidencia propia (mínimo ${NEURON_MIN_VOTES_TRAIT} votos cada una).`;
        return lines.join('\n');
    }

    /* ── State ─────────────────────────────────────── */
    let history  = [];
    let activeConvId = null;
    let _isOpen  = false;
    let isSending = false;
    let _lastUserText = null;

    /* ── Image sources ──────────────────────────────── */
    const script       = document.querySelector('script[src*="chat-widget"]');
    const _defaultFull = script?.dataset.mascota || '/assets/img/mascota1.png';
    const _defaultPeek = _defaultFull.replace('mascota1', 'mascota');

    function _safeSrc(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            if (v && /^[^:]*$/.test(v) && !/[<>"']/.test(v)) return v;
        } catch(e) {}
        return fallback;
    }
    const mascotaFull = _safeSrc('vn_mascot_hover_src',  _defaultFull);
    const mascotaPeek = _safeSrc('vn_mascot_widget_src', _defaultPeek);

    /* ── System Prompt ─────────────────────────────── */
    const SYSTEM_PROMPT = `Eres VALL-AI, un analista financiero institucional de élite integrado en la plataforma VALLNews — Inteligencia Económica.

TU PERFIL:
• Especialista en mercados financieros globales, divisas (USD/MXN), tasas de interés y política monetaria de Banxico y la Fed.
• Experto en mercados de commodities agropecuarios (maíz, soya, trigo, café, ganado) y energéticos (petróleo Brent/WTI, gas natural).
• Analista geopolítico con enfoque en impacto económico: conflictos, sanciones, aranceles, cadenas de suministro.
• Conocedor profundo de la economía mexicana: IPC, BMV, inflación, PIB, remesas, T-MEC.

REGLAS:
1. Responde SIEMPRE en español mexicano profesional.
2. Ajusta la extensión a la pregunta: si es simple, responde en 1-2 frases directas.
   Si piden un análisis, reporte o "explica a fondo", desarrolla con la profundidad
   que el tema merezca — no recortes artificialmente un análisis completo.
3. Cuando tengas datos de la página del usuario, analízalos proactivamente.
4. Usa **negritas** para datos clave y cifras.
5. Si te preguntan algo fuera de finanzas/economía/mercados, responde brevemente y redirige amablemente.
6. Cuando des análisis, estructura: situación actual → factores clave → perspectiva o
   recomendación de monitoreo. Usa listas numeradas o con viñetas y encabezados cortos
   (### Título) para organizar respuestas largas.
7. NO inventes datos numéricos específicos. Si no tienes el dato, dilo honestamente.
   Cuando recibas un bloque [DATOS DE MERCADO EN VIVO], esas cifras vienen de las APIs
   internas de VALLNews en tiempo real — úsalas con confianza y cítalas como propias
   ("según datos de VALLNews"), sin inventar ninguna adicional que no esté ahí.
8. Firma tus análisis importantes como "— VALL-AI, Inteligencia Económica".
9. Cuando el usuario navegue entre secciones, adapta tu contexto a la nueva página automáticamente.
10. Si el usuario pide "un reporte", "documento" o "en Word", redacta la respuesta como
    un reporte formal y completo (título, secciones, conclusión) — el botón de descarga
    junto al mensaje generará el archivo .doc con ese contenido automáticamente.
11. GRÁFICAS — REGLA OBLIGATORIA: si el usuario pide una gráfica/gráfico/chart/
    visualización/diagrama (o pide un reporte "con gráficas"), tu ÚNICA forma válida de
    dibujarla es un bloque de código con lenguaje "chart" y SOLO JSON válido dentro, así:
    \`\`\`chart
    {"type":"bar","title":"Título corto","labels":["Ene","Feb","Mar"],"datasets":[{"label":"Serie","data":[1,2,3]}]}
    \`\`\`
    - TERMINANTEMENTE PROHIBIDO: dibujar la gráfica con caracteres de texto/ASCII (█, ▓, -,
      |, etc.), tablas markdown simulando barras, o cualquier "arte" hecho de símbolos.
      Si no vas a usar el bloque \`\`\`chart, no intentes representar la gráfica de ninguna
      otra forma — descríbela solo en palabras.
    - "type" debe ser exactamente uno de: bar, line, pie, doughnut, radar.
    - Usa cifras reales de [DATOS DE MERCADO EN VIVO], de la conversación, o de las que el
      propio usuario te dé en su mensaje. Si no hay una serie histórica real disponible,
      acláralo en el texto que acompaña la gráfica (ej. "estimación ilustrativa") — nunca
      presentes una cifra inventada como dato oficial.
    - Máximo 6 series y 24 puntos por serie. SIEMPRE acompaña el bloque con 1-3 frases de
      análisis fuera del bloque de código — nunca entregues solo la gráfica sin contexto.
    - Estas gráficas se renderizan como imágenes reales en el chat y se incluyen
      automáticamente en el reporte de Word que el usuario descargue.`;

    /* ── Snapshot de mercado en vivo (vía nuestras propias APIs) ──
       A diferencia de getPageContext() (que solo lee el DOM visible), esto
       da al chat cifras reales sin importar en qué página esté el usuario. */
    let _marketSnapshotCache = null;
    let _marketSnapshotTs = 0;
    const MARKET_SNAPSHOT_TTL = 5 * 60 * 1000;

    async function _fetchIndexQuote(ticker) {
        try {
            const r = await fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&interval=1d&range=5d`, { credentials: 'include' });
            if (!r.ok) return null;
            const j = await r.json();
            const m = j?.meta;
            if (!m || m.regularMarketPrice == null) return null;
            return { price: m.regularMarketPrice, pct: m.regularMarketChangePercent };
        } catch { return null; }
    }

    async function getLiveMarketSnapshot() {
        if (_marketSnapshotCache && Date.now() - _marketSnapshotTs < MARKET_SNAPSHOT_TTL) {
            return _marketSnapshotCache;
        }
        if (typeof VDS === 'undefined') return null;
        const fmtPct = (p) => (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
        const lines = [];
        try {
            const [usd, tiie, corn, oil, vix, ipc, btc] = await Promise.all([
                VDS.usdmxn().catch(() => null),
                VDS.banxico('SF61745').catch(() => null),
                VDS.commodityWithPct('CORN').catch(() => null),
                VDS.commodityWithPct('CRUDE_OIL').catch(() => null),
                _fetchIndexQuote('^VIX'),
                _fetchIndexQuote('^MXX'),
                _fetchIndexQuote('BTC-USD'),
            ]);
            if (usd)  lines.push(`USD/MXN: $${(+usd).toFixed(2)}`);
            if (tiie) lines.push(`TIIE 28d (Banxico): ${(+tiie).toFixed(2)}%`);
            if (ipc)  lines.push(`IPC BMV: ${ipc.price.toFixed(0)} pts (${fmtPct(ipc.pct)})`);
            if (vix)  lines.push(`VIX (volatilidad): ${vix.price.toFixed(2)} (${fmtPct(vix.pct)})`);
            if (btc)  lines.push(`BTC/USD: $${btc.price.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${fmtPct(btc.pct)})`);
            if (corn) lines.push(`Maíz (CBOT): $${corn.price.toFixed(2)}/bu (${fmtPct(corn.pct)})`);
            if (oil)  lines.push(`Petróleo WTI: $${oil.price.toFixed(2)}/bbl (${fmtPct(oil.pct)})`);
        } catch { /* se usa lo que se haya podido reunir */ }
        if (!lines.length) return null;
        _marketSnapshotCache = lines.join('\n');
        _marketSnapshotTs = Date.now();
        return _marketSnapshotCache;
    }

    /* ── Extracción de contexto de la página actual ── */
    function getPageContext() {
        const page = detectPage();
        const meta = PAGE_META[page] || PAGE_META.default;
        const parts = [`[SECCIÓN ACTIVA: ${meta.name.toUpperCase()}]`];

        const titleEl = document.querySelector('.page-title');
        if (titleEl) parts.push(`Título visible: ${titleEl.textContent.trim().slice(0, 80)}`);

        const stats = [];
        document.querySelectorAll('.kpi-value,.stat-val,.ct-val,.rg-num,.kpi-num,[class*="price"],[class*="valor"]').forEach(el => {
            const label = el.closest('[class*="card"],[class*="kpi"],[class*="ct-"]')
                ?.querySelector('[class*="title"],[class*="label"],[class*="name"],.ct-title,.kpi-label')
                ?.textContent?.trim();
            const val = el.textContent.trim();
            if (val && val.length < 40) stats.push(label ? `${label}: ${val}` : val);
        });
        if (stats.length) parts.push(`Indicadores:\n${stats.slice(0, 12).map(s => '  • ' + s).join('\n')}`);

        const headlines = [];
        document.querySelectorAll('.nc-title,.news-title,.news-item .news-title').forEach(el => {
            const t = el.textContent.trim();
            if (t && t.length > 10 && t.length < 150) headlines.push(t);
        });
        if (headlines.length) parts.push(`Titulares:\n${headlines.slice(0, 6).map(h => '  📰 ' + h).join('\n')}`);

        const rg = document.getElementById('rg-num');
        if (rg && rg.textContent !== '--') {
            const rgLabel = document.getElementById('rg-label');
            parts.push(`Índice de Tensión Global: ${rg.textContent}/100 — ${rgLabel?.textContent || ''}`);
        }

        return parts.join('\n\n');
    }

    /* ── Markdown renderer ──────────────────────────── */
    function renderMd(text) {
        let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Tablas markdown (| col | col |) — se extraen primero para que las reglas de
        // listas/párrafos que siguen no rompan su estructura de filas/columnas.
        const tables = [];
        escaped = escaped.replace(/^(\|.*\|[ \t]*\n\|?[ \t:-]+\|[ \t:|-]*\n(?:\|.*\|[ \t]*\n?)+)/gm, (block) => {
            const rows = block.trim().split('\n').map(r => r.trim());
            const header = rows[0].replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            const bodyRows = rows.slice(2).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
            let html = '<table class="vn-tbl"><thead><tr>' + header.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
            bodyRows.forEach(r => { html += '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>'; });
            html += '</tbody></table>';
            tables.push(html);
            return `@@VN_TABLE_${tables.length - 1}@@`;
        });

        // Gráficas ```chart {json}``` — se extraen igual que las tablas, antes de que el
        // resaltado de código en línea (una sola comilla) las desarme. Si la fence todavía
        // no se cerró (llegando en streaming), se deja como placeholder de carga: la gráfica
        // real solo se hidrata una vez que la respuesta terminó (ver _hydrateCharts).
        const charts = [];
        escaped = escaped.replace(/```chart\s*\n([\s\S]*?)```/g, (_, raw) => {
            const jsonStr = raw.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            let spec;
            try { spec = JSON.parse(jsonStr); } catch { return ''; }
            if (!spec || !Array.isArray(spec.labels) || !Array.isArray(spec.datasets) || !spec.datasets.length) return '';
            charts.push(spec);
            return `@@VN_CHART_${charts.length - 1}@@`;
        });
        let hasLoadingChart = false;
        escaped = escaped.replace(/```chart[\s\S]*$/, () => { hasLoadingChart = true; return '@@VN_CHART_LOADING@@'; });

        let out = escaped
            .replace(/^###\s+(.+)$/gm, '<div style="font-weight:700;margin:.5rem 0 .2rem;font-size:.95em">$1</div>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,.08);padding:1px 4px;border-radius:3px;font-size:.82em">$1</code>')
            .replace(/^[\s]*(\d+\.\s+.+)/gm, '<li style="margin:2px 0;list-style:none">$1</li>')
            .replace(/^[\s]*[-•]\s+(.+)/gm, '<li style="margin:2px 0;list-style:none">• $1</li>')
            .replace(/\n\n+/g, '<br><br>')
            .replace(/\n/g, '<br>');

        tables.forEach((html, idx) => { out = out.replace(`@@VN_TABLE_${idx}@@`, html); });
        charts.forEach((spec, idx) => { out = out.replace(`@@VN_CHART_${idx}@@`, _chartBlockHtml(spec)); });
        if (hasLoadingChart) out = out.replace('@@VN_CHART_LOADING@@', '<div class="vn-chart-loading"><i class="fas fa-spinner fa-spin"></i> Generando gráfica…</div>');
        return out;
    }

    function _chartBlockHtml(spec) {
        const rawTitle = spec && spec.title ? String(spec.title).slice(0, 120) : '';
        const title = rawTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(spec))));
        return `<div class="vn-chart-wrap" data-chart-spec="${b64}">`
            + (title ? `<div class="vn-chart-title">${title}</div>` : '')
            + `<div class="vn-chart-canvas-box"><canvas></canvas></div>`
            + `</div>`;
    }

    // Instancia Chart.js sobre los <canvas> pendientes dentro de un contenedor ya insertado
    // en el DOM. Se llama solo en el render final (no en cada chunk del streaming) para no
    // destruir/recrear la gráfica en cada fragmento que llega.
    async function _hydrateCharts(container) {
        if (!container) return;
        const nodes = container.querySelectorAll('.vn-chart-wrap[data-chart-spec]');
        if (!nodes.length) return;
        if (typeof VDS === 'undefined' || !VDS.ensureChartJs) return;
        try { await VDS.ensureChartJs(); } catch { return; }
        nodes.forEach(el => {
            const canvas = el.querySelector('canvas');
            if (!canvas || canvas.dataset.vnChart === '1') return;
            let spec;
            try { spec = JSON.parse(decodeURIComponent(escape(atob(el.dataset.chartSpec)))); } catch { return; }
            canvas.dataset.vnChart = '1';
            VDS.buildChart(canvas, spec);
        });
    }

    function _destroyChartsIn(container) {
        if (!container || typeof Chart === 'undefined') return;
        container.querySelectorAll('canvas[data-vn-chart="1"]').forEach(cv => {
            try { Chart.getChart(cv)?.destroy(); } catch {}
        });
    }

    let _mermaidPromise = null;
    function _ensureMermaid() {
        if (window.mermaid) return Promise.resolve(window.mermaid);
        if (_mermaidPromise) return _mermaidPromise;
        _mermaidPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-vn-mermaid]');
            const tag = existing || document.createElement('script');
            if (!existing) {
                tag.src = '/assets/js/vendor/mermaid.min.js';
                tag.async = true;
                tag.dataset.vnMermaid = '1';
                document.head.appendChild(tag);
            }
            const ready = () => window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid no disponible'));
            tag.addEventListener('load', ready, { once: true });
            tag.addEventListener('error', () => reject(new Error('No se pudo cargar Mermaid')), { once: true });
            if (window.mermaid) ready();
        }).then(api => {
            api.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', suppressErrorRendering: true });
            return api;
        });
        return _mermaidPromise;
    }

    function _safeDownload(block) {
        const blob = new Blob([String(block.content || '')], { type: block.mimeType || 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = block.filename || 'documento.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function _appendRichBlock(fragment, block) {
        if (!block || !block.type) return;
        let el;
        if (block.type === 'heading') {
            el = document.createElement(`h${Math.min(4, Math.max(2, Number(block.level) || 2))}`);
            el.className = 'vn-rich-heading'; el.textContent = block.content || '';
        } else if (block.type === 'text' || block.type === 'markdown') {
            el = document.createElement('div'); el.className = 'vn-rich-markdown'; el.innerHTML = renderMd(block.content || '');
        } else if (block.type === 'code') {
            el = document.createElement('div'); el.className = 'vn-rich-code';
            const head = document.createElement('div'); head.className = 'vn-rich-code-head';
            head.textContent = block.filename || block.language || 'código';
            const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copiar';
            copy.addEventListener('click', () => navigator.clipboard?.writeText(block.content || ''));
            head.appendChild(copy);
            const pre = document.createElement('pre'); const code = document.createElement('code');
            code.className = `language-${block.language || 'text'}`; code.textContent = block.content || '';
            pre.appendChild(code); el.append(head, pre);
        } else if (block.type === 'table') {
            el = document.createElement('div'); el.className = 'vn-rich-table-wrap';
            if (block.title) { const t = document.createElement('div'); t.className = 'vn-rich-block-title'; t.textContent = block.title; el.appendChild(t); }
            const table = document.createElement('table'); table.className = 'vn-tbl';
            const thead = document.createElement('thead'); const trh = document.createElement('tr');
            (block.headers || []).forEach(value => { const th = document.createElement('th'); th.textContent = value; trh.appendChild(th); });
            thead.appendChild(trh); table.appendChild(thead);
            const tbody = document.createElement('tbody');
            (block.rows || []).forEach(row => { const tr = document.createElement('tr'); row.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }); tbody.appendChild(tr); });
            table.appendChild(tbody); el.appendChild(table);
        } else if (block.type === 'diagram') {
            el = document.createElement('div'); el.className = 'vn-rich-diagram';
            if (block.title) { const t = document.createElement('div'); t.className = 'vn-rich-block-title'; t.textContent = block.title; el.appendChild(t); }
            const canvas = document.createElement('div'); canvas.className = 'vn-mermaid-canvas';
            canvas.dataset.source = btoa(unescape(encodeURIComponent(block.content || '')));
            canvas.innerHTML = '<span class="vn-rich-loading"><i class="fas fa-spinner fa-spin"></i> Renderizando diagrama…</span>';
            el.appendChild(canvas);
        } else if (block.type === 'chart') {
            el = document.createElement('div'); el.innerHTML = _chartBlockHtml(block.spec || {}); el = el.firstElementChild || el;
        } else if (block.type === 'image') {
            el = document.createElement('figure'); el.className = 'vn-rich-image';
            const img = document.createElement('img'); img.src = block.url; img.alt = block.alt || ''; img.loading = 'lazy';
            el.appendChild(img);
            if (block.caption) { const cap = document.createElement('figcaption'); cap.textContent = block.caption; el.appendChild(cap); }
        } else if (block.type === 'quote') {
            el = document.createElement('blockquote'); el.className = 'vn-rich-quote'; el.textContent = block.content || '';
            if (block.source) { const cite = document.createElement('cite'); cite.textContent = `— ${block.source}`; el.appendChild(cite); }
        } else if (block.type === 'alert') {
            el = document.createElement('div'); el.className = `vn-rich-alert ${block.severity || 'info'}`;
            if (block.title) { const title = document.createElement('strong'); title.textContent = block.title; el.appendChild(title); }
            const text = document.createElement('div'); text.innerHTML = renderMd(block.content || ''); el.appendChild(text);
        } else if (block.type === 'steps' || block.type === 'checklist') {
            el = document.createElement('section'); el.className = `vn-rich-${block.type}`;
            if (block.title) { const title = document.createElement('div'); title.className = 'vn-rich-block-title'; title.textContent = block.title; el.appendChild(title); }
            const list = document.createElement(block.type === 'steps' ? 'ol' : 'ul');
            (block.items || []).forEach(item => { const li = document.createElement('li'); li.textContent = `${block.type === 'checklist' ? (item.checked ? '☑ ' : '☐ ') : ''}${item.text || ''}`; list.appendChild(li); });
            el.appendChild(list);
        } else if (block.type === 'comparison') {
            el = document.createElement('section'); el.className = 'vn-rich-comparison';
            if (block.title) { const title = document.createElement('div'); title.className = 'vn-rich-block-title'; title.textContent = block.title; el.appendChild(title); }
            const grid = document.createElement('div'); grid.className = 'vn-rich-comparison-grid';
            (block.items || []).forEach(item => {
                const card = document.createElement('article'); const title = document.createElement('strong'); title.textContent = item.title || '';
                const content = document.createElement('p'); content.textContent = item.content || ''; card.append(title, content);
                const addList = (label, values, cls) => { if (!values?.length) return; const h = document.createElement('span'); h.className = cls; h.textContent = label; card.appendChild(h); const ul = document.createElement('ul'); values.forEach(v => { const li = document.createElement('li'); li.textContent = v; ul.appendChild(li); }); card.appendChild(ul); };
                addList('Ventajas', item.pros, 'vn-pro'); addList('Consideraciones', item.cons, 'vn-con'); grid.appendChild(card);
            });
            el.appendChild(grid);
        } else if (block.type === 'formula') {
            el = document.createElement('div'); el.className = 'vn-rich-formula';
            const formula = document.createElement('code'); formula.textContent = block.content || ''; el.appendChild(formula);
            if (block.description) { const desc = document.createElement('p'); desc.textContent = block.description; el.appendChild(desc); }
        } else if (block.type === 'document') {
            el = document.createElement('article'); el.className = 'vn-rich-document';
            if (block.title) { const h = document.createElement('h2'); h.textContent = block.title; el.appendChild(h); }
            (block.sections || []).forEach(section => { const s = document.createElement('section'); const h = document.createElement('h3'); h.textContent = section.title || ''; const body = document.createElement('div'); body.innerHTML = renderMd(section.content || ''); s.append(h, body); el.appendChild(s); });
        } else if (block.type === 'download') {
            el = document.createElement('button'); el.type = 'button'; el.className = 'vn-rich-download';
            el.innerHTML = '<i class="fas fa-download"></i> ';
            el.appendChild(document.createTextNode(block.label || 'Descargar'));
            el.addEventListener('click', () => _safeDownload(block));
        }
        if (el) fragment.appendChild(el);
    }

    async function _hydrateDiagrams(container) {
        const nodes = container?.querySelectorAll('.vn-mermaid-canvas[data-source]') || [];
        if (!nodes.length) return;
        let api;
        try { api = await _ensureMermaid(); } catch { api = null; }
        for (const node of nodes) {
            let source = '';
            try { source = decodeURIComponent(escape(atob(node.dataset.source))); } catch {}
            if (!api || !source) { node.textContent = source || 'No se pudo representar el diagrama.'; continue; }
            try {
                const id = `vn-mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const rendered = await api.render(id, source);
                node.innerHTML = rendered.svg;
                node.removeAttribute('data-source');
            } catch {
                node.textContent = source;
                node.classList.add('vn-mermaid-fallback');
            }
        }
    }

    function renderRichInto(container, response, fallbackText = '') {
        if (!container) return;
        _destroyChartsIn(container);
        container.innerHTML = '';
        if (!response || response.type !== 'rich_response' || !Array.isArray(response.blocks)) {
            container.innerHTML = renderMd(fallbackText || 'Respuesta no disponible.');
            return;
        }
        const root = document.createElement('div'); root.className = 'vn-rich-response';
        if (response.summary) { const summary = document.createElement('div'); summary.className = 'vn-rich-summary'; summary.innerHTML = renderMd(response.summary); root.appendChild(summary); }
        const fragment = document.createDocumentFragment();
        response.blocks.forEach(block => _appendRichBlock(fragment, block));
        root.appendChild(fragment); container.appendChild(root);
        _hydrateCharts(container); _hydrateDiagrams(container);
    }

    function _fmtTime(ts) {
        try { return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); }
        catch { return ''; }
    }

    function _plainText(content) {
        return content
            .replace(/^###\s+(.+)$/gm, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1');
    }

    /* ── Selección automática de modelo según complejidad de la tarea ──
       gemini-2.5-flash es rápido y tiene cuota generosa; gemini-2.5-pro razona
       mejor en análisis largos pero es más lento y su cuota gratuita es muy
       limitada, así que solo se pide cuando la pregunta realmente lo amerita.
       El backend valida el nivel (whitelist 'flash'|'pro') — esto es solo la heurística. */
    const _PRO_INTENT_RE = /\b(reporte|documento|word|\.doc|an[aá]lisis (profundo|detallado|completo|a fondo)|analiza a fondo|proyecci[oó]n(es)?|pron[oó]stico|escenarios?|compara(r|ci[oó]n)?|estrategia|recomendaci[oó]n de inversi[oó]n|impacto (de|en)|explica (por qu[eé]|a fondo)|elabora|desarrolla|tendencias?|correlaci[oó]n|riesgo sist[eé]mico|m[uú]ltiples|varios (activos|mercados|pa[ií]ses|escenarios)|a largo plazo|qu[eé] pasar[ií]a si|c[oó]mo afecta|profundiza|gr[aá]fica|gr[aá]fico|graficar|chart|diagrama|visualiza(ci[oó]n)?)\b/i;

    function _classifyComplexity(text) {
        const t = (text || '').trim();
        if (!t) return 'flash';
        if (_PRO_INTENT_RE.test(t)) return 'pro';
        if ((t.match(/\?/g) || []).length >= 2) return 'pro'; // pregunta compuesta con varias partes
        if (t.length > 220) return 'pro'; // mensaje largo → probablemente pide un análisis extenso
        return 'flash';
    }

    /* ── Gemini API (vía backend — la API key nunca se expone al cliente) ──
       Streaming: el texto llega en fragmentos (SSE) y se pinta en vivo,
       en vez de esperar 5-20s a que el modelo termine todo el análisis. */
    let _activeCtrl = null; // expuesto para que el botón "Detener" pueda cancelar la petición en curso
    async function _geminiStreamRequest(request, tier, onChunk) {
        const ctrl = new AbortController();
        _activeCtrl = ctrl;
        const tid  = setTimeout(() => ctrl.abort(), 45000);
        let usedTier = tier;
        try {
            // Enviar ambos nombres mantiene compatibilidad con el backend nuevo
            // (`message`) y con procesos locales antiguos que todavía esperan
            // `prompt`. Así una pestaña con caché o un servidor sin reiniciar no
            // termina respondiendo "Prompt vacío".
            const normalizedMessage = String(request?.message || request?.prompt || '').trim();
            if (!normalizedMessage) throw new Error('Escribe una pregunta antes de enviarla.');
            const res = await fetch('/api/ai-insight-stream', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...request,
                    message: normalizedMessage,
                    prompt: normalizedMessage,
                    tier,
                    structured: true,
                }),
                signal: ctrl.signal,
            });
            if (!res.ok || !res.body) {
                const errBody = await res.json().catch(() => null);
                throw new Error(errBody?.error ? `${res.status}: ${errBody.error}` : `Gemini HTTP ${res.status}`);
            }

            const reader  = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buf = '';
            let full = '';
            let richResponse = null;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });

                let idx;
                while ((idx = buf.indexOf('\n\n')) !== -1) {
                    const raw = buf.slice(0, idx);
                    buf = buf.slice(idx + 2);
                    const line = raw.trim();
                    if (!line.startsWith('data:')) continue;
                    let payload;
                    try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }
                    if (payload.error) throw new Error(payload.error);
                    if (payload.text) { full += payload.text; onChunk(full); }
                    if (payload.response) richResponse = payload.response;
                    if (payload.done) {
                        if (payload.tier) usedTier = payload.tier;
                        return { text: payload.finalText || full, tier: usedTier, response: richResponse };
                    }
                }
            }
            return { text: full, tier: usedTier, response: richResponse };
        } finally {
            clearTimeout(tid);
            if (_activeCtrl === ctrl) _activeCtrl = null;
        }
    }

    async function callGemini(userMessage, onChunk, tier = 'flash') {
        const parts = [];
        const recentHistory = [];

        // Historial reciente (últimas 8 interacciones = 16 entradas)
        if (history.length > 0) {
            const recent = history.filter(h => !h._hidden).slice(-16);
            if (recent.length) {
                recent.forEach(h => {
                    recentHistory.push({ role: h.role, content: h.text.slice(0, 1200) });
                });
            }
        }

        // Perfil adaptativo: interés recurrente + preferencia de concisión aprendida del feedback
        const interest     = _topInterest();
        const conciseHint  = _concisenessHint();
        if (interest || conciseHint) {
            const profileLines = [];
            if (interest) profileLines.push(`Este usuario pregunta con frecuencia sobre ${TOPIC_LABELS[interest]?.label || interest}; ten esto presente si es relevante para la pregunta.`);
            if (conciseHint) profileLines.push(conciseHint);
            parts.push('[PERFIL DEL USUARIO]\n' + profileLines.join(' ') + '\n[FIN PERFIL]\n');
        }

        // "Neurona": instrucciones de estilo aprendidas de los 👍/👎 acumulados
        // sobre respuestas anteriores (tablas, listas, longitud, negritas...).
        const neuronHint = _neuronHints();
        if (neuronHint) parts.push('[ESTILO APRENDIDO]\n' + neuronHint + '\n[FIN ESTILO]\n');

        // Contexto de la página actual (en primer mensaje y cada 8 turnos de usuario)
        const userTurns = history.filter(h => h.role === 'user' && !h._hidden).length;
        if (userTurns === 0 || userTurns % 8 === 0) {
            const ctx = getPageContext();
            if (ctx) parts.push('[CONTEXTO DE PÁGINA ACTUAL]\n' + ctx + '\n[FIN CONTEXTO]\n');
        }

        // Datos de mercado en vivo desde nuestras propias APIs (independiente de la
        // página en la que esté el usuario — funciona incluso en inicio/configuración).
        const historicalChartPromise = typeof VDS !== 'undefined' && VDS.historicalUsdMxnChartSpec
            ? VDS.historicalUsdMxnChartSpec(userMessage).catch(() => null)
            : Promise.resolve(null);
        const hasApiContext = typeof VDS !== 'undefined' && Boolean(VDS.aiDataContext);
        const apiContextPromise = hasApiContext
            ? VDS.aiDataContext(userMessage).catch(() => '')
            : Promise.resolve('');
        const [apiContext, historicalUsdMxnChart] = await Promise.all([
            apiContextPromise,
            historicalChartPromise,
        ]);
        if (apiContext) {
            parts.push(apiContext);
        } else if (!hasApiContext) {
            const snapshot = await getLiveMarketSnapshot();
            if (snapshot) parts.push('[DATOS DE MERCADO EN VIVO — de nuestras APIs internas]\n' + snapshot + '\n[FIN DATOS]\n');
        }
        if (historicalUsdMxnChart) {
            parts.push(
                `[SERIE HISTÓRICA VERIFICADA PARA LA GRÁFICA]\n${JSON.stringify(historicalUsdMxnChart)}\n`
                + 'Usa exactamente estos datos para responder y generar el bloque chart solicitado.\n[FIN SERIE HISTÓRICA]\n'
            );
        }

        const request = {
            message: userMessage,
            context: parts.join('\n\n'),
            history: recentHistory,
            mode: (() => { try { return localStorage.getItem(RESPONSE_MODE_KEY) || 'auto'; } catch { return 'auto'; } })(),
        };
        let { text: reply, tier: usedTier, response } = await _geminiStreamRequest(request, tier, onChunk);
        if (!reply) throw new Error('Respuesta vacía');

        const chartRequested = _isChartRequest(userMessage);
        const hasChart = /```chart\s*\n/i.test(reply) || response?.blocks?.some?.(block => block.type === 'chart');
        const serverChartStatus = response?.meta?.chartStatus;
        if (chartRequested && !hasChart && !serverChartStatus && typeof VDS !== 'undefined') {
            const spec = historicalUsdMxnChart;
            if (spec) {
                reply = reply.trim() + `\n\n## Gráfica interactiva\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``;
                if (response?.blocks) response.blocks.push({ type: 'chart', spec });
            }
        }

        history.push({ role: 'user',  text: userMessage, ts: Date.now() });
        history.push({ role: 'model', text: reply, rich: response || null, ts: Date.now() });
        if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

        _persistActiveConversation();
        return { reply, tier: usedTier, response };
    }

    /* ── Build Widget ─────────────────────────────── */
    function buildWidget() {
        if (document.getElementById('vn-cw')) return;

        /* ── CSS ── */
        const style = document.createElement('style');
        style.textContent = `
#vn-cw {
    position: fixed; right: 0; bottom: 14vh;
    z-index: 99999; display: flex; flex-direction: column; align-items: flex-end;
}

/* ── Mascot button ── */
#vn-cw-btn {
    width: 112px; height: 136px; cursor: pointer;
    transform: translateX(36px);
    transition: transform .4s cubic-bezier(.34,1.56,.64,1);
    filter: drop-shadow(-5px 3px 10px rgba(0,0,0,.28));
    position: relative; background: none; border: none; padding: 0;
}
#vn-cw-btn:hover, #vn-cw-btn.open { transform: translateX(0); }
#vn-cw-btn img {
    width: 100%; height: 100%; object-fit: contain; display: block;
    position: absolute; top: 0; left: 0; transition: opacity .25s ease; pointer-events: none;
}
#vn-cw-img-normal { opacity: 1; }
#vn-cw-img-hover  { opacity: 0; }
#vn-cw-btn:hover #vn-cw-img-normal, #vn-cw-btn.open #vn-cw-img-normal { opacity: 0; }
#vn-cw-btn:hover #vn-cw-img-hover,  #vn-cw-btn.open #vn-cw-img-hover  { opacity: 1; }

/* Indicador de mensajes guardados */
#vn-cw-badge {
    position: absolute; top: 6px; left: 6px;
    background: #00213a; color: #fff; font-size: .5rem; font-weight: 800;
    padding: 2px 6px; border-radius: 10px; letter-spacing: .5px;
    font-family: 'Inter', sans-serif; white-space: nowrap;
    opacity: 0; transform: scale(.8); transition: all .2s;
    pointer-events: none;
}
#vn-cw-badge.visible { opacity: 1; transform: scale(1); }

/* ── Chat panel ── */
#vn-cw-box {
    position: fixed; right: 118px; bottom: 18px; top: 18px; width: 440px;
    border-radius: 18px; background: #f0f4f8; overflow: hidden;
    box-shadow: 0 12px 48px rgba(0,0,0,.22); border: 1px solid rgba(0,33,58,.07);
    display: flex; flex-direction: column;
    animation: vn-up .22s ease;
}
@keyframes vn-up { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }

/* ── Header ── */
#vn-cw-hdr {
    background: linear-gradient(135deg,#00213a,#003a6e);
    padding: .7rem 1rem; display: flex; align-items: center;
    justify-content: space-between; flex-shrink: 0;
}
#vn-cw-hdr-left { display:flex; align-items:center; gap:.6rem; }
#vn-cw-hdr-avatar { width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,.12); padding:3px; object-fit:contain; }
#vn-cw-hdr-title { font-family:'Inter',sans-serif; font-weight:700; font-size:.84rem; color:#fff; }
#vn-cw-hdr-sub { font-family:'Inter',sans-serif; font-size:.58rem; color:rgba(255,255,255,.6); margin-top:.05rem; letter-spacing:.3px; }
#vn-cw-page-tag {
    display:inline-block; font-size:.48rem; font-weight:800; text-transform:uppercase;
    letter-spacing:.8px; background:rgba(56,189,248,.22); color:#7dd3fc;
    padding:2px 7px; border-radius:10px; margin-left:.5rem; vertical-align:middle;
}
#vn-cw-hdr-online { display:inline-block; width:7px; height:7px; background:#4ade80; border-radius:50%; margin-left:.3rem; vertical-align:middle; }
.vn-neuron-badge {
    display:none; font-size:.6rem; margin-left:.4rem; vertical-align:middle; cursor:default;
    opacity:.85; animation:vn-neuron-pulse 2.4s ease-in-out infinite;
}
.vn-neuron-badge.visible { display:inline-block; }
@keyframes vn-neuron-pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
#vn-cw-hdr-actions { display:flex; gap:.35rem; align-items:center; position:relative; }
#vn-cw-newchat, #vn-cw-more, #vn-cw-close {
    background:rgba(255,255,255,.1); border:none; color:rgba(255,255,255,.7);
    font-size:.85rem; cursor:pointer; padding:.32rem .55rem; border-radius:6px; transition:.2s;
    display:flex; align-items:center; justify-content:center;
}
#vn-cw-newchat:hover, #vn-cw-more:hover, #vn-cw-close:hover { background:rgba(255,255,255,.2); color:#fff; }
#vn-cw-more.vn-menu-open { background:rgba(255,255,255,.22); color:#fff; }

/* ── Menú desplegable "más opciones" ── */
#vn-cw-menu {
    position:absolute; top:calc(100% + 8px); right:34px; z-index:20; min-width:210px;
    background:#fff; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.2);
    border:1px solid rgba(0,33,58,.08); overflow:hidden;
    opacity:0; transform:translateY(-6px) scale(.98); pointer-events:none; transition:opacity .15s ease, transform .15s ease;
}
#vn-cw-menu.vn-menu-open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
.vn-menu-item {
    display:flex; align-items:center; gap:10px; width:100%; text-align:left;
    padding:.62rem .95rem; background:none; border:none; cursor:pointer;
    font-size:.78rem; font-family:'Inter',sans-serif; font-weight:500; color:#1e293b; transition:background .15s;
}
.vn-menu-item:hover { background:rgba(0,33,58,.06); }
.vn-menu-item i { width:16px; text-align:center; color:#64748b; font-size:.82rem; }
.vn-menu-item.vn-menu-danger { color:#dc2626; border-top:1px solid rgba(0,0,0,.06); }
.vn-menu-item.vn-menu-danger i { color:#dc2626; }

/* ── Messages ── */
#vn-cw-msgs {
    flex:1; overflow-y:auto; padding:.8rem 1rem;
    display:flex; flex-direction:column; gap:.5rem;
    background:#f8fafc; scroll-behavior:smooth; position:relative;
}
#vn-cw-msgs::-webkit-scrollbar { width:4px; }
#vn-cw-msgs::-webkit-scrollbar-thumb { background:#dde2ea; border-radius:4px; }

.vn-m { display:flex; flex-direction:column; }
.vn-m.u { align-items:flex-end; }
.vn-m.b { flex-direction:row; align-items:flex-end; gap:6px; }
.vn-avatar {
    width:26px; height:26px; border-radius:50%; object-fit:contain; flex-shrink:0;
    background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.12); padding:3px; margin-bottom:2px;
}
.vn-col { display:flex; flex-direction:column; align-items:flex-start; max-width:84%; min-width:0; }
.vn-bbl {
    max-width:84%; padding:.5rem .8rem; border-radius:14px;
    font-size:.76rem; line-height:1.55; font-family:'Inter',sans-serif;
    word-break:break-word; animation: vnMsgIn .25s ease-out;
}
.vn-m.b .vn-col .vn-bbl { max-width:100%; }
@keyframes vnMsgIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
.vn-m.b .vn-bbl { background:#fff; color:#1e293b; box-shadow:0 1px 4px rgba(0,0,0,.07); border-bottom-left-radius:4px; }
.vn-m.b .vn-bbl strong { color:#00213a; }
.vn-m.u .vn-bbl { background:#00213a; color:#fff; border-bottom-right-radius:4px; }
.vn-m.sys .vn-bbl { background:rgba(0,33,58,.06); color:#64748b; font-size:.64rem; text-align:center; font-style:italic; box-shadow:none; padding:.25rem .6rem; border-radius:8px; max-width:90%; }

/* ── Barra de acciones bajo cada respuesta ── */
.vn-msg-actions { display:flex; align-items:center; gap:4px; margin-top:.3rem; flex-wrap:wrap; }
.vn-act-btn {
    background:none; border:1px solid rgba(0,33,58,.18); border-radius:6px;
    padding:3px 8px; font-size:.66rem; font-weight:600; color:#00213a;
    cursor:pointer; transition:background .15s, border-color .15s; display:inline-flex; align-items:center; gap:4px;
}
.vn-act-btn:hover { background:rgba(0,33,58,.06); border-color:#00213a; }
.vn-act-btn.vn-dl-word i { color:#2b579a; }
.vn-act-btn.active-up   { background:#dcfce7; border-color:#16a34a; color:#166534; }
.vn-act-btn.active-down { background:#fee2e2; border-color:#dc2626; color:#991b1b; }
.vn-act-btn:disabled { opacity:.55; cursor:default; }
.vn-act-btn.vn-copied { background:#dbeafe; border-color:#2563eb; color:#1e40af; }

/* ── Timestamp bajo cada burbuja ── */
.vn-ts { font-size:.56rem; color:#a3adba; margin-top:2px; font-family:'Inter',sans-serif; padding:0 2px; }
.vn-tier-badge {
    display:inline-flex; align-items:center; gap:4px; margin-top:.3rem; padding:2px 8px;
    font-size:.6rem; font-weight:700; letter-spacing:.2px; color:#7c3aed;
    background:rgba(124,58,237,.09); border:1px solid rgba(124,58,237,.22); border-radius:20px;
    width:fit-content;
}

/* ── Tablas dentro de una respuesta ── */
.vn-bbl table.vn-tbl { border-collapse:collapse; width:100%; margin:.4rem 0; font-size:.7rem; }
.vn-bbl table.vn-tbl th, .vn-bbl table.vn-tbl td { border:1px solid rgba(0,33,58,.14); padding:3px 6px; text-align:left; }
.vn-bbl table.vn-tbl th { background:rgba(0,33,58,.06); color:#00213a; font-weight:700; }
.vn-bbl table.vn-tbl tr:nth-child(even) td { background:rgba(0,33,58,.02); }

/* ── Gráficas generadas por VALL-AI ── */
.vn-chart-wrap { margin:.5rem 0; padding:.7rem .8rem .55rem; background:#fff; border:1px solid rgba(0,33,58,.1); border-radius:10px; }
.vn-chart-title { font-size:.68rem; font-weight:700; color:#00213a; margin-bottom:.4rem; }
.vn-chart-canvas-box { position:relative; height:190px; width:100%; }
.vn-chart-loading { display:flex; align-items:center; gap:6px; font-size:.68rem; color:#64748b; padding:.45rem 0; }

/* ── Botón flotante "ir al final" ── */
#vn-cw-scrollbtn {
    position:absolute; right:16px; bottom:80px; z-index:5;
    width:30px; height:30px; border-radius:50%; background:#00213a; color:#fff;
    border:none; cursor:pointer; box-shadow:0 3px 10px rgba(0,0,0,.25);
    display:none; align-items:center; justify-content:center; font-size:.75rem;
    transition:background .2s;
}
#vn-cw-scrollbtn:hover { background:#003a6e; }

/* ── Panel de historial de conversaciones (estilo Gemini/Claude) ── */
#vn-cw-histpanel {
    position:absolute; inset:0; z-index:15; background:#f8fafc;
    display:flex; flex-direction:column;
    opacity:0; pointer-events:none; transition:opacity .15s ease;
}
#vn-cw-histpanel.vn-hist-open { opacity:1; pointer-events:auto; }
#vn-cw-histpanel-hdr {
    padding:.7rem 1rem; border-bottom:1px solid rgba(0,0,0,.07); background:#fff; flex-shrink:0;
    display:flex; align-items:center; justify-content:space-between;
}
#vn-cw-histpanel-back {
    background:none; border:none; color:#00213a; font-weight:700; font-size:.78rem;
    cursor:pointer; display:flex; align-items:center; gap:7px; font-family:'Inter',sans-serif; padding:.2rem;
}
#vn-cw-histpanel-back:hover { color:#003a6e; }
#vn-cw-histpanel-title { font-size:.78rem; font-weight:700; color:#00213a; font-family:'Inter',sans-serif; }
#vn-cw-histpanel-list { flex:1; overflow-y:auto; padding:.4rem 0 .8rem; }
.vn-hist-group-hdr { font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.7px; color:#94a3b8; padding:.7rem 1rem .3rem; font-family:'Inter',sans-serif; }
.vn-hist-conv { display:flex; align-items:center; gap:2px; padding:0 .55rem; }
.vn-hist-conv-title {
    flex:1; text-align:left; background:none; border:none; padding:.6rem .55rem; border-radius:8px;
    font-size:.78rem; color:#1e293b; font-family:'Inter',sans-serif; cursor:pointer;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.vn-hist-conv:hover .vn-hist-conv-title { background:rgba(0,33,58,.05); }
.vn-hist-conv-active .vn-hist-conv-title { background:rgba(56,189,248,.15); color:#00213a; font-weight:700; }
.vn-hist-conv-del {
    background:none; border:none; color:#cbd5e1; cursor:pointer; padding:.5rem; border-radius:6px; flex-shrink:0;
    opacity:0; transition:opacity .15s, color .15s, background .15s;
}
.vn-hist-conv:hover .vn-hist-conv-del { opacity:1; }
.vn-hist-conv-del:hover { color:#dc2626; background:rgba(220,38,38,.08); }
.vn-hist-empty { padding:1.4rem 1rem; text-align:center; color:#94a3b8; font-size:.76rem; font-family:'Inter',sans-serif; }

/* ── Typing ── */
.vn-typing-wrap { display:flex; align-items:center; gap:6px; }
.vn-typing span { display:inline-block; width:6px; height:6px; background:#94a3b8; border-radius:50%; margin:0 2px; animation:vn-dot .8s infinite; }
.vn-typing span:nth-child(2) { animation-delay:.16s; }
.vn-typing span:nth-child(3) { animation-delay:.32s; }
@keyframes vn-dot { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
.vn-typing-sec { font-size:.62rem; color:#94a3b8; font-family:'Inter',sans-serif; }

/* ── Suggestions ── */
#vn-cw-sugs { display:flex; flex-wrap:wrap; gap:5px; padding:7px 12px; flex-shrink:0; border-top:1px solid rgba(0,0,0,.06); background:rgba(255,255,255,.6); }
.vn-sug-btn { background:#fff; border:1px solid rgba(0,33,58,.12); color:#00213a; font-size:.64rem; font-weight:600; padding:4px 11px; border-radius:20px; cursor:pointer; transition:.2s; font-family:'Inter',sans-serif; white-space:nowrap; }
.vn-sug-btn:hover { background:#00213a; color:#fff; border-color:#00213a; }
.vn-sug-btn.vn-sug-personal { border-color:#38bdf8; color:#0369a1; }
.vn-sug-btn.vn-sug-personal:hover { background:#0369a1; border-color:#0369a1; color:#fff; }

/* ── Footer ── */
#vn-cw-footer { display:flex; flex-direction:column; gap:.25rem; padding:.55rem .75rem .65rem; border-top:1px solid #e8edf3; background:#fff; flex-shrink:0; }
#vn-cw-mode-row { display:flex; align-items:center; justify-content:space-between; gap:.5rem; font-size:.62rem; color:#64748b; }
#vn-cw-mode { border:1px solid #dbe2ea; border-radius:7px; background:#f8fafc; color:#334155; font:600 .62rem 'Inter',sans-serif; padding:.2rem .38rem; outline:none; }
#vn-cw-footer-row { display:flex; gap:.45rem; align-items:flex-end; }
#vn-cw-charcount { display:none; font-size:.58rem; color:#94a3b8; font-family:'Inter',sans-serif; text-align:right; padding-right:2px; }
#vn-cw-input {
    flex:1; border:1px solid #dde2ea; border-radius:9px; padding:.42rem .7rem; font-size:.76rem;
    font-family:'Inter',sans-serif; outline:none; color:#1e293b; background:#f8fafc; transition:border-color .2s;
    resize:none; overflow-y:auto; max-height:110px; line-height:1.4;
}
#vn-cw-input:focus { border-color:#00213a; }
#vn-cw-send {
    background:#00213a; color:#fff; border:none; border-radius:9px; padding:.42rem .9rem; cursor:pointer;
    font-size:.82rem; transition:background .2s; display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
#vn-cw-send:hover { background:#003a6e; }
#vn-cw-send:disabled { background:#94a3b8; cursor:default; }
#vn-cw-send.vn-stop { background:#dc2626; cursor:pointer; }
#vn-cw-send.vn-stop:hover { background:#b91c1c; }

/* ── Respuestas estructuradas ── */
.vn-rich-response { display:flex; flex-direction:column; gap:.68rem; min-width:0; }
.vn-rich-summary { padding:.62rem .72rem; border-left:3px solid #0ea5e9; border-radius:0 8px 8px 0; background:#f0f9ff; color:#0c4a6e; font-weight:600; }
.vn-rich-heading { margin:.25rem 0 0; color:#00213a; font-size:.96rem; line-height:1.3; }
.vn-rich-markdown { line-height:1.65; }
.vn-rich-code { overflow:hidden; border:1px solid #1e293b; border-radius:10px; background:#0f172a; color:#e2e8f0; }
.vn-rich-code-head { display:flex; align-items:center; justify-content:space-between; padding:.38rem .62rem; background:#1e293b; color:#cbd5e1; font:600 .65rem 'Inter',sans-serif; }
.vn-rich-code-head button { border:0; border-radius:5px; padding:.2rem .42rem; background:#334155; color:#fff; cursor:pointer; font-size:.62rem; }
.vn-rich-code pre { max-height:360px; margin:0; padding:.75rem; overflow:auto; white-space:pre; font:500 .7rem/1.55 ui-monospace,SFMono-Regular,Consolas,monospace; }
.vn-rich-table-wrap { max-width:100%; overflow-x:auto; }
.vn-rich-block-title { margin:0 0 .38rem; color:#00213a; font-weight:800; font-size:.78rem; }
.vn-rich-diagram { padding:.65rem; border:1px solid #dbe2ea; border-radius:10px; background:#fff; overflow:auto; }
.vn-mermaid-canvas { min-height:90px; display:flex; align-items:center; justify-content:center; }
.vn-mermaid-canvas svg { max-width:100%; height:auto; }
.vn-mermaid-fallback { justify-content:flex-start; white-space:pre; overflow:auto; font:500 .66rem ui-monospace,monospace; }
.vn-rich-loading { color:#64748b; font-size:.7rem; }
.vn-rich-alert { padding:.62rem .72rem; border-radius:9px; border:1px solid #bae6fd; background:#f0f9ff; color:#0c4a6e; }
.vn-rich-alert.success { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
.vn-rich-alert.warning { border-color:#fde68a; background:#fffbeb; color:#92400e; }
.vn-rich-alert.danger { border-color:#fecaca; background:#fef2f2; color:#991b1b; }
.vn-rich-alert strong { display:block; margin-bottom:.2rem; }
.vn-rich-quote { margin:0; padding:.65rem .75rem; border-left:3px solid #94a3b8; background:#f8fafc; color:#334155; font-style:italic; }
.vn-rich-quote cite { display:block; margin-top:.35rem; color:#64748b; font-size:.68rem; }
.vn-rich-steps ol,.vn-rich-checklist ul { margin:.25rem 0 0; padding-left:1.25rem; }
.vn-rich-steps li,.vn-rich-checklist li { margin:.28rem 0; line-height:1.5; }
.vn-rich-checklist ul { list-style:none; padding-left:.15rem; }
.vn-rich-comparison-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:.55rem; }
.vn-rich-comparison article { padding:.62rem; border:1px solid #dbe2ea; border-radius:9px; background:#fff; }
.vn-rich-comparison article p { margin:.3rem 0; }
.vn-rich-comparison .vn-pro,.vn-rich-comparison .vn-con { display:block; margin-top:.4rem; font-size:.65rem; font-weight:800; }
.vn-rich-comparison .vn-pro { color:#15803d; } .vn-rich-comparison .vn-con { color:#b45309; }
.vn-rich-comparison ul { margin:.2rem 0 0; padding-left:1rem; }
.vn-rich-formula { padding:.65rem; border-radius:9px; background:#f8fafc; text-align:center; overflow-x:auto; }
.vn-rich-formula code { font:600 .78rem ui-monospace,monospace; color:#0f172a; white-space:pre; }
.vn-rich-document { padding:.72rem; border:1px solid #dbe2ea; border-radius:10px; background:#fff; }
.vn-rich-document h2,.vn-rich-document h3 { color:#00213a; }
.vn-rich-image { margin:0; } .vn-rich-image img { display:block; width:100%; height:auto; border-radius:9px; }
.vn-rich-image figcaption { margin-top:.3rem; color:#64748b; font-size:.66rem; text-align:center; }
.vn-rich-download { align-self:flex-start; border:0; border-radius:8px; padding:.48rem .7rem; background:#00213a; color:#fff; cursor:pointer; font-weight:700; }

/* ── Mobile ── */
@media (max-width:768px) {
    #vn-cw { bottom:8px; right:0; }
    #vn-cw-btn { width:86px; height:104px; transform:translateX(0); }
    #vn-cw-btn:hover, #vn-cw-btn.open { transform:translateX(0); }
    #vn-cw-box { left:8px; right:8px; width:auto; top:58px; bottom:112px; max-height:none; border-radius:14px; }
}
`;
        document.head.appendChild(style);

        /* ── Custom translateX override ── */
        const _CSS_VAL = /^-?\d+(\.\d+)?(px|%)$/;
        try {
            const _tx  = localStorage.getItem('vn_mascot_translate');
            const _txM = localStorage.getItem('vn_mascot_translate_m');
            if (_tx && _CSS_VAL.test(_tx.trim())) {
                const txS  = _tx.trim();
                const txMS = (_txM && _CSS_VAL.test(_txM.trim())) ? _txM.trim() : txS;
                const st = document.createElement('style');
                st.id = 'vn-mascot-tx';
                st.textContent =
                    `#vn-cw-btn{transform:translateX(${txS}) !important;}` +
                    `#vn-cw-btn:hover,#vn-cw-btn.open{transform:translateX(0) !important;}` +
                    `@media(max-width:768px){#vn-cw-btn{transform:translateX(${txMS}) !important;}` +
                    `#vn-cw-btn:hover,#vn-cw-btn.open{transform:translateX(0) !important;}}`;
                document.head.appendChild(st);
            }
        } catch(e) {}

        /* ── HTML ── */
        const curPage = detectPage();
        const curMeta = PAGE_META[curPage] || PAGE_META.default;

        const wrap = document.createElement('div');
        wrap.id = 'vn-cw';
        wrap.innerHTML = `
<div id="vn-cw-box" style="display:none;">
    <div id="vn-cw-hdr">
        <div id="vn-cw-hdr-left">
            <img id="vn-cw-hdr-avatar" src="${mascotaFull}" alt="VALL-AI">
            <div>
                <div id="vn-cw-hdr-title">VALL-AI <span id="vn-cw-hdr-online"></span><span id="vn-cw-page-tag">${curMeta.name}</span><span id="vn-cw-neuron-badge" class="vn-neuron-badge" title="El aprendizaje de estilo está activo — ve a Aprendizaje de VALL-AI en el menú">🧠</span></div>
                <div id="vn-cw-hdr-sub">Analista de Inteligencia Financiera · Gemini 2.5</div>
            </div>
        </div>
        <div id="vn-cw-hdr-actions">
            <button id="vn-cw-newchat" title="Nueva conversación"><i class="fas fa-plus"></i></button>
            <button id="vn-cw-more" title="Más opciones" aria-haspopup="true"><i class="fas fa-ellipsis-vertical"></i></button>
            <button id="vn-cw-close" title="Cerrar"><i class="fas fa-xmark"></i></button>
            <div id="vn-cw-menu">
                <button id="vn-cw-profile" class="vn-menu-item"><i class="fas fa-user"></i> Mi perfil de intereses</button>
                <button id="vn-cw-neuron" class="vn-menu-item"><i class="fas fa-brain"></i> Aprendizaje de VALL-AI</button>
                <button id="vn-cw-history" class="vn-menu-item"><i class="fas fa-clock-rotate-left"></i> Historial de conversaciones</button>
                <button id="vn-cw-export" class="vn-menu-item"><i class="fas fa-file-word"></i> Exportar esta conversación</button>
                <button id="vn-cw-clear" class="vn-menu-item vn-menu-danger"><i class="fas fa-trash-can"></i> Eliminar todas las conversaciones</button>
            </div>
        </div>
    </div>
    <div id="vn-cw-msgs">
        <div id="vn-cw-histpanel">
            <div id="vn-cw-histpanel-hdr">
                <button id="vn-cw-histpanel-back"><i class="fas fa-arrow-left"></i> Volver al chat</button>
                <span id="vn-cw-histpanel-title">Historial</span>
            </div>
            <div id="vn-cw-histpanel-list"></div>
        </div>
    </div>
    <button id="vn-cw-scrollbtn" title="Ir al final"><i class="fas fa-arrow-down"></i></button>
    <div id="vn-cw-sugs"></div>
    <div id="vn-cw-footer">
        <div id="vn-cw-mode-row"><span>Formato de respuesta</span><select id="vn-cw-mode" aria-label="Modo de respuesta"><option value="auto">Automático</option><option value="quick">Rápido</option><option value="normal">Normal</option><option value="detailed">Detallado</option><option value="technical">Técnico</option><option value="executive">Ejecutivo</option></select></div>
        <div id="vn-cw-charcount"></div>
        <div id="vn-cw-footer-row">
            <textarea id="vn-cw-input" rows="1" placeholder="Pregunta sobre mercados, finanzas, geopolítica…" maxlength="${MAX_INPUT}"></textarea>
            <button id="vn-cw-send" title="Enviar"><i class="fas fa-paper-plane"></i></button>
        </div>
    </div>
</div>
<button id="vn-cw-btn" title="Hablar con VALL-AI" aria-label="Abrir asistente VALL-AI">
    <div id="vn-cw-badge"></div>
    <img id="vn-cw-img-normal" src="${mascotaPeek}" alt="VALL-AI">
    <img id="vn-cw-img-hover"  src="${mascotaFull}" alt="VALL-AI">
</button>`;
        document.body.appendChild(wrap);

        /* ── DOM refs ── */
        const box    = document.getElementById('vn-cw-box');
        const btn    = document.getElementById('vn-cw-btn');
        const close  = document.getElementById('vn-cw-close');
        const clearB = document.getElementById('vn-cw-clear');
        const exportB = document.getElementById('vn-cw-export');
        const profileB = document.getElementById('vn-cw-profile');
        const neuronB = document.getElementById('vn-cw-neuron');
        const historyB = document.getElementById('vn-cw-history');
        const newChatB = document.getElementById('vn-cw-newchat');
        const moreBtn  = document.getElementById('vn-cw-more');
        const menu     = document.getElementById('vn-cw-menu');
        const histPanel = document.getElementById('vn-cw-histpanel');
        const histBack  = document.getElementById('vn-cw-histpanel-back');
        const histList  = document.getElementById('vn-cw-histpanel-list');

        function closeMenu() { menu.classList.remove('vn-menu-open'); moreBtn.classList.remove('vn-menu-open'); }
        function toggleMenu() { menu.classList.toggle('vn-menu-open'); moreBtn.classList.toggle('vn-menu-open'); }
        moreBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
        menu.addEventListener('click', (e) => { if (e.target.closest('.vn-menu-item')) closeMenu(); });
        document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) closeMenu(); });
        const input  = document.getElementById('vn-cw-input');
        const send   = document.getElementById('vn-cw-send');
        const msgs   = document.getElementById('vn-cw-msgs');
        const sugs   = document.getElementById('vn-cw-sugs');
        const badge  = document.getElementById('vn-cw-badge');
        const pageTag = document.getElementById('vn-cw-page-tag');
        const neuronBadge = document.getElementById('vn-cw-neuron-badge');
        function _updateNeuronBadge() { neuronBadge.classList.toggle('visible', !!_neuronHints()); }
        const scrollBtn = document.getElementById('vn-cw-scrollbtn');
        const charCount = document.getElementById('vn-cw-charcount');
        const responseMode = document.getElementById('vn-cw-mode');
        try { responseMode.value = localStorage.getItem(RESPONSE_MODE_KEY) || 'auto'; } catch {}
        responseMode.addEventListener('change', () => { try { localStorage.setItem(RESPONSE_MODE_KEY, responseMode.value); } catch {} });

        /* ── Auto-scroll inteligente: no arrastra al usuario hacia abajo si
           subió a leer mensajes anteriores mientras llega una respuesta larga. ── */
        function _isNearBottom() { return msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 60; }
        function _refreshScrollBtn() { scrollBtn.style.display = _isNearBottom() ? 'none' : 'flex'; }
        function _scrollToBottom(force) {
            if (force || _isNearBottom()) { msgs.scrollTop = msgs.scrollHeight; scrollBtn.style.display = 'none'; }
            else _refreshScrollBtn();
        }
        msgs.addEventListener('scroll', _refreshScrollBtn);
        scrollBtn.addEventListener('click', () => { msgs.scrollTop = msgs.scrollHeight; scrollBtn.style.display = 'none'; });

        /* ── Textarea auto-expandible + contador de caracteres ── */
        function _autoResizeInput() {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 110) + 'px';
        }
        function _updateCharCount() {
            const len = input.value.length;
            if (len > 600) {
                charCount.textContent = `${len}/${MAX_INPUT}`;
                charCount.style.display = 'block';
                charCount.style.color = len >= MAX_INPUT - 20 ? '#dc2626' : '#94a3b8';
            } else {
                charCount.style.display = 'none';
            }
        }
        input.addEventListener('input', () => { _autoResizeInput(); _updateCharCount(); });
        const DOC_INTENT_RE = /\b(documento|reporte|word|\.doc|descargar|archivo)\b/i;

        function _avatarEl() {
            const img = document.createElement('img');
            img.className = 'vn-avatar';
            img.src = mascotaPeek;
            img.alt = 'VALL-AI';
            return img;
        }

        function addMsg(content, role, ts, richResponse = null) {
            const row = document.createElement('div');
            row.className = `vn-m ${role}`;
            const bbl = document.createElement('div');
            bbl.className = 'vn-bbl';
            if (role === 'b') {
                if (richResponse) renderRichInto(bbl, richResponse, content);
                else { bbl.innerHTML = renderMd(content); _hydrateCharts(bbl); }
            }
            else bbl.textContent = content;

            if (role === 'b') {
                row.appendChild(_avatarEl());
                const col = document.createElement('div');
                col.className = 'vn-col';
                col.appendChild(bbl);
                if (ts) {
                    const t = document.createElement('div');
                    t.className = 'vn-ts';
                    t.textContent = _fmtTime(ts);
                    col.appendChild(t);
                }
                row.appendChild(col);
            } else {
                row.appendChild(bbl);
                if (ts && role !== 'sys') {
                    const t = document.createElement('div');
                    t.className = 'vn-ts';
                    t.textContent = _fmtTime(ts);
                    row.appendChild(t);
                }
            }
            msgs.appendChild(row);
            _scrollToBottom(true);
            return row;
        }

        // Construye la barra de acciones (Word / Copiar / 👍👎 / Regenerar) bajo una respuesta terminada.
        function _attachActions(row, bbl, content, { forceDownload = false, regenerable = false, ts = Date.now(), tier = null } = {}) {
            const old = row.querySelector('.vn-msg-actions');
            if (old) old.remove();
            const oldTs = row.querySelector('.vn-ts');
            if (oldTs) oldTs.remove();
            const oldTier = row.querySelector('.vn-tier-badge');
            if (oldTier) oldTier.remove();

            const bar = document.createElement('div');
            bar.className = 'vn-msg-actions';

            // Orden pensado como flujo natural de lectura: copiar → calificar → regenerar → exportar.
            const copy = document.createElement('button');
            copy.className = 'vn-act-btn';
            copy.title = 'Copiar respuesta';
            copy.innerHTML = '<i class="fas fa-copy"></i> Copiar';
            copy.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(_plainText(content));
                    copy.classList.add('vn-copied');
                    const prevHtml = copy.innerHTML;
                    copy.innerHTML = '<i class="fas fa-check"></i> Copiado';
                    setTimeout(() => { copy.classList.remove('vn-copied'); copy.innerHTML = prevHtml; }, 1200);
                } catch {}
            });
            bar.appendChild(copy);

            const up   = document.createElement('button');
            const down = document.createElement('button');
            up.className = down.className = 'vn-act-btn';
            up.title = 'Buena respuesta'; down.title = 'Respuesta poco útil';
            up.innerHTML   = '<i class="fas fa-thumbs-up"></i>';
            down.innerHTML = '<i class="fas fa-thumbs-down"></i>';
            const castVote = (liked) => {
                up.disabled = down.disabled = true;
                up.classList.toggle('active-up', liked);
                down.classList.toggle('active-down', !liked);
                _trackFeedback(liked, content.length);
                _recordNeuronFeedback(content, liked);
                _updateNeuronBadge();
            };
            up.addEventListener('click', () => castVote(true));
            down.addEventListener('click', () => castVote(false));
            bar.appendChild(up);
            bar.appendChild(down);

            if (regenerable) {
                const regen = document.createElement('button');
                regen.className = 'vn-act-btn';
                regen.title = 'Generar otra respuesta';
                regen.innerHTML = '<i class="fas fa-rotate"></i> Regenerar';
                regen.addEventListener('click', () => {
                    if (isSending || !_lastUserText) return;
                    history = history.slice(0, -2); // quita el último turno (usuario+modelo) para regenerarlo
                    ask(_lastUserText, { regenerateRow: row, regenerateBbl: bbl });
                });
                bar.appendChild(regen);
            }

            if ((content.length > 150 || forceDownload) && typeof VDS !== 'undefined' && (VDS.downloadElementAsWord || VDS.downloadAsWord)) {
                const dl = document.createElement('button');
                dl.className = 'vn-act-btn vn-dl-word';
                dl.title = 'Descargar esta respuesta como documento Word';
                dl.innerHTML = '<i class="fas fa-file-word"></i> Word';
                dl.addEventListener('click', () => {
                    const stamp = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const title = (_lastUserText ? _lastUserText.slice(0, 70) : 'Análisis VALL-AI');
                    // Se pasa el contenido CON su formato markdown (títulos, negritas, tablas)
                    // en vez de texto plano — downloadAsWord lo convierte a un documento con
                    // jerarquía visual real, no un bloque de texto con saltos de línea.
                    if (VDS.downloadElementAsWord) VDS.downloadElementAsWord(`VALL-AI_reporte_${stamp.replace(/\//g, '-')}`, bbl, { title });
                    else VDS.downloadAsWord(`VALL-AI_reporte_${stamp.replace(/\//g, '-')}`, content, { title });
                });
                bar.appendChild(dl);
            }

            const target = row.querySelector('.vn-col') || row;
            target.appendChild(bar);
            if (tier === 'pro') {
                const badge = document.createElement('div');
                badge.className = 'vn-tier-badge';
                badge.title = 'Esta respuesta usó Gemini 2.5 Pro por la complejidad de la pregunta';
                badge.innerHTML = '<i class="fas fa-brain"></i> Análisis profundo (Pro)';
                target.appendChild(badge);
            }
            const t = document.createElement('div');
            t.className = 'vn-ts';
            t.textContent = _fmtTime(ts);
            target.appendChild(t);
        }

        // Crea una burbuja de respuesta que se va llenando en vivo conforme llegan fragmentos (streaming).
        function addStreamingMsg() {
            const row = document.createElement('div');
            row.className = 'vn-m b';
            row.appendChild(_avatarEl());
            const col = document.createElement('div');
            col.className = 'vn-col';
            const bbl = document.createElement('div');
            bbl.className = 'vn-bbl';
            col.appendChild(bbl);
            row.appendChild(col);
            msgs.appendChild(row);
            _scrollToBottom(true);
            return {
                row, bbl,
                reset() { _destroyChartsIn(bbl); bbl.innerHTML = ''; const a = row.querySelector('.vn-msg-actions'); if (a) a.remove(); const t = row.querySelector('.vn-ts'); if (t) t.remove(); },
                update(partial) { bbl.innerHTML = renderMd(partial); _scrollToBottom(false); },
                finish(finalText, opts = {}) { if (opts.richResponse) renderRichInto(bbl, opts.richResponse, finalText); else { bbl.innerHTML = renderMd(finalText); _hydrateCharts(bbl); } _attachActions(row, bbl, finalText, opts); _scrollToBottom(false); },
                fail(msgText) { row.className = 'vn-m sys'; row.innerHTML = ''; bbl.textContent = msgText; row.appendChild(bbl); },
            };
        }

        let _typingTimer = null;
        function showTyping(afterRow) {
            const row = document.createElement('div');
            row.className = 'vn-m b'; row.id = 'vn-typing';
            row.innerHTML = `<img class="vn-avatar" src="${mascotaPeek}" alt="VALL-AI"><div class="vn-bbl vn-typing-wrap"><span class="vn-typing"><span></span><span></span><span></span></span><span class="vn-typing-sec">Pensando…</span></div>`;
            if (afterRow && afterRow.nextSibling) msgs.insertBefore(row, afterRow.nextSibling);
            else msgs.appendChild(row);
            _scrollToBottom(true);
            const t0 = Date.now();
            const secEl = row.querySelector('.vn-typing-sec');
            _typingTimer = setInterval(() => {
                const s = Math.floor((Date.now() - t0) / 1000);
                if (secEl) secEl.textContent = s > 0 ? `Pensando… ${s}s` : 'Pensando…';
            }, 500);
        }
        function hideTyping() {
            if (_typingTimer) { clearInterval(_typingTimer); _typingTimer = null; }
            document.getElementById('vn-typing')?.remove();
        }

        function loadSuggestions() {
            const pg = detectPage();
            const list = (PAGE_META[pg] || PAGE_META.default).sugs.slice();
            const chips = list.map(s => ({ text: s, personal: false }));

            // Sugerencia dinámica basada en el tema más consultado por el usuario (si aplica a esta página)
            const interest = _topInterest();
            if (interest && TOPIC_LABELS[interest]) {
                const already = chips.some(c => c.text === TOPIC_LABELS[interest].q);
                if (!already) chips.unshift({ text: TOPIC_LABELS[interest].q, personal: true, label: `🔎 Más sobre ${TOPIC_LABELS[interest].label}` });
            }

            sugs.innerHTML = chips.slice(0, 4).map(c =>
                `<button class="vn-sug-btn${c.personal ? ' vn-sug-personal' : ''}" data-q="${c.text.replace(/"/g,'&quot;')}">${c.personal ? c.label : c.text}</button>`
            ).join('');
            sugs.querySelectorAll('.vn-sug-btn').forEach(b => {
                b.addEventListener('click', () => { input.value = b.dataset.q; doSend(); });
            });
        }

        function updatePageTag() {
            const pg = detectPage();
            const meta = PAGE_META[pg] || PAGE_META.default;
            if (pageTag) pageTag.textContent = meta.name;
            _updateNeuronBadge();
        }

        function updateBadge() {
            const userCount = history.filter(h => h.role === 'user' && !h._hidden).length;
            if (userCount > 0 && !_isOpen) {
                badge.textContent = `${userCount} msg${userCount > 1 ? 's' : ''}`;
                badge.classList.add('visible');
            } else {
                badge.classList.remove('visible');
            }
        }

        function showWelcome() {
            const pg = detectPage();
            const meta = PAGE_META[pg] || PAGE_META.default;
            addMsg(`¡Hola! Soy **VALL-AI**, tu analista de inteligencia financiera. Estoy en **${meta.name}** y puedo leer los indicadores en pantalla para darte análisis en tiempo real.\n\n¿En qué te puedo ayudar?`, 'b');
            loadSuggestions();
        }

        /* ── Renderiza la conversación activa (`history`) en el DOM ── */
        function _renderActiveConversation() {
            _destroyChartsIn(msgs);
            msgs.innerHTML = '';
            msgs.appendChild(histPanel); // el panel de historial vive dentro de #vn-cw-msgs como overlay
            if (!history.length) { showWelcome(); return; }

            let lastQuestion = '';
            let upgraded = false;
            history.forEach(h => {
                if (h._hidden) return;
                if (h.role === 'user') lastQuestion = h.text || '';
                else if (lastQuestion && _sanitizeLegacyChartMessage(h, lastQuestion)) upgraded = true;
                const row = addMsg(h.text, h.role === 'user' ? 'u' : 'b', h.ts, h.rich || null);
                if (h.role === 'model') _attachActions(row, row.querySelector('.vn-bbl'), h.text, { ts: h.ts });
            });
            if (upgraded) _persistActiveConversation();

            // Si el usuario cambió de página desde la última vez, mostrar nota de contexto
            const ui = _loadUiState();
            const nowPage = detectPage();
            if (ui.lastPage && ui.lastPage !== nowPage) {
                const lastName = (PAGE_META[ui.lastPage] || PAGE_META.default).name;
                const nowName  = (PAGE_META[nowPage] || PAGE_META.default).name;
                addMsg(`📍 Navegaste de **${lastName}** a **${nowName}**. El contexto de esta página ya está disponible para VALL-AI.`, 'sys');
                history.push({ role: 'user',  text: `[Sistema: El usuario navegó de ${lastName} a ${nowName}. Adapta tu contexto.]`, _hidden: true });
                history.push({ role: 'model', text: `[Entendido. Ahora el usuario está en ${nowName}. Ajustaré mi contexto.]`, _hidden: true });
                _persistActiveConversation();
            }

            loadSuggestions();
            updateBadge();
            _scrollToBottom(true);
        }

        /* ── Historial de conversaciones (estilo Gemini/Claude) ── */
        function _relativeGroup(ts) {
            const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86400000);
            if (diffDays <= 0) return 'Hoy';
            if (diffDays === 1) return 'Ayer';
            if (diffDays <= 7) return 'Últimos 7 días';
            return 'Anteriores';
        }

        function _renderHistoryList() {
            const convs = _loadConversations().sort((a, b) => b.updatedAt - a.updatedAt);
            histList.innerHTML = '';
            if (!convs.length) {
                const empty = document.createElement('div');
                empty.className = 'vn-hist-empty';
                empty.textContent = 'Aún no tienes conversaciones guardadas. Empieza a chatear y aparecerán aquí.';
                histList.appendChild(empty);
                return;
            }
            let lastGroup = null;
            convs.forEach(c => {
                const group = _relativeGroup(c.updatedAt);
                if (group !== lastGroup) {
                    const gh = document.createElement('div');
                    gh.className = 'vn-hist-group-hdr';
                    gh.textContent = group;
                    histList.appendChild(gh);
                    lastGroup = group;
                }
                const item = document.createElement('div');
                item.className = 'vn-hist-conv' + (c.id === activeConvId ? ' vn-hist-conv-active' : '');

                const titleBtn = document.createElement('button');
                titleBtn.className = 'vn-hist-conv-title';
                titleBtn.textContent = c.title || 'Nueva conversación';
                titleBtn.addEventListener('click', () => _switchConversation(c.id));

                const delBtn = document.createElement('button');
                delBtn.className = 'vn-hist-conv-del';
                delBtn.title = 'Eliminar esta conversación';
                delBtn.innerHTML = '<i class="fas fa-trash-can"></i>';
                delBtn.addEventListener('click', (e) => { e.stopPropagation(); _deleteConversationFromUi(c.id); });

                item.appendChild(titleBtn);
                item.appendChild(delBtn);
                histList.appendChild(item);
            });
        }

        function _openHistoryPanel() {
            _persistActiveConversation(); // asegura que lo más reciente ya esté guardado antes de listar
            _renderHistoryList();
            histPanel.classList.add('vn-hist-open');
        }
        function _closeHistoryPanel() { histPanel.classList.remove('vn-hist-open'); }

        function _switchConversation(id) {
            if (id === activeConvId) { _closeHistoryPanel(); return; }
            _persistActiveConversation();
            const conv = _loadConversations().find(c => c.id === id);
            if (!conv) return;
            activeConvId = id;
            _setActiveId(id);
            history = conv.messages;
            _closeHistoryPanel();
            _renderActiveConversation();
        }

        function _deleteConversationFromUi(id) {
            _deleteConversation(id);
            if (id === activeConvId) {
                activeConvId = _newConvId();
                _setActiveId(activeConvId);
                history = [];
                _renderActiveConversation();
            }
            _renderHistoryList();
        }

        /* ── Ask: núcleo compartido por envío normal y "Regenerar" ──
           El botón de enviar se convierte en botón "Detener" mientras isSending
           es true; _userCancelled marca que el corte vino del usuario y no de un
           error real, para poder conservar el texto parcial ya generado. */
        let _userCancelled = false;

        function _setSendingUI(sending) {
            input.disabled = sending;
            if (sending) { send.classList.add('vn-stop'); send.innerHTML = '<i class="fas fa-stop"></i>'; send.title = 'Detener generación'; }
            else { send.classList.remove('vn-stop'); send.innerHTML = '<i class="fas fa-paper-plane"></i>'; send.title = 'Enviar'; }
        }

        async function ask(text, { regenerateRow, regenerateBbl } = {}) {
            isSending = true;
            _setSendingUI(true);
            _lastUserText = text;

            const streamMsg = (regenerateRow && regenerateBbl)
                ? { row: regenerateRow, bbl: regenerateBbl,
                    reset() { _destroyChartsIn(regenerateBbl); regenerateBbl.innerHTML = ''; const a = regenerateRow.querySelector('.vn-msg-actions'); if (a) a.remove(); const t = regenerateRow.querySelector('.vn-ts'); if (t) t.remove(); },
                    update(partial) { regenerateBbl.innerHTML = renderMd(partial); _scrollToBottom(false); },
                    finish(finalText, opts = {}) { if (opts.richResponse) renderRichInto(regenerateBbl, opts.richResponse, finalText); else { regenerateBbl.innerHTML = renderMd(finalText); _hydrateCharts(regenerateBbl); } _attachActions(regenerateRow, regenerateBbl, finalText, opts); _scrollToBottom(false); },
                    fail(m) { regenerateBbl.textContent = m; } }
                : addStreamingMsg();

            if (regenerateRow) streamMsg.reset();

            showTyping(regenerateRow || null);
            const wantsDoc = DOC_INTENT_RE.test(text);
            const tier = _classifyComplexity(text);
            let firstChunk = true;
            let lastPartial = '';

            let attempt = 0;
            while (true) {
                try {
                    const { reply, tier: usedTier, response } = await callGemini(text, (partial) => {
                        lastPartial = partial;
                        if (firstChunk) { hideTyping(); firstChunk = false; }
                        streamMsg.update(partial);
                    }, tier);
                    hideTyping();
                    streamMsg.finish(reply, { forceDownload: wantsDoc, regenerable: true, tier: usedTier, richResponse: response });
                    updateBadge();
                    if (!regenerateRow) loadSuggestions(); // vuelve a mostrar sugerencias (ya actualizadas con el perfil) tras cada respuesta
                    break;
                } catch (err) {
                    hideTyping();
                    if (_userCancelled) {
                        _userCancelled = false;
                        if (lastPartial) {
                            streamMsg.finish(lastPartial + '\n\n*(detenido por el usuario)*', { forceDownload: false, regenerable: true });
                            history.push({ role: 'user', text, ts: Date.now() });
                            history.push({ role: 'model', text: lastPartial, ts: Date.now() });
                            if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
                            _persistActiveConversation();
                            updateBadge();
                            if (!regenerateRow) loadSuggestions();
                        } else {
                            streamMsg.fail('Generación detenida.');
                        }
                        break;
                    }
                    const m = err.message || '';
                    const transient = m.includes('429') || m.includes('503');
                    if (transient && attempt < 1) {
                        attempt++;
                        streamMsg.reset();
                        firstChunk = true;
                        lastPartial = '';
                        showTyping(regenerateRow || null);
                        await new Promise(r => setTimeout(r, 1800));
                        continue;
                    }
                    const errMsg = m.includes('401')                            ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
                                 : m.includes('503')                            ? 'VALL-AI no está configurada en el servidor.'
                                 : m.includes('429')                            ? 'Límite de peticiones alcanzado. Espera unos segundos.'
                                 : m.includes('abort') || m.includes('timeout') ? 'Tiempo de espera agotado. Intenta de nuevo.'
                                 : `Error VALL-AI: ${m.slice(0, 100)}`;
                    streamMsg.fail(errMsg);
                    break;
                }
            }

            isSending = false;
            _setSendingUI(false);
            input.focus();
        }

        /* ── Send ── */
        async function doSend() {
            const text = input.value.trim();
            if (!text || isSending) return;
            input.value = '';
            _autoResizeInput();
            _updateCharCount();
            sugs.innerHTML = '';

            addMsg(text, 'u', Date.now());
            _trackTopic(text);
            await ask(text);
        }

        /* ── Events ── */
        btn.addEventListener('click', () => {
            const opening = box.style.display === 'none';
            box.style.display = opening ? 'flex' : 'none';
            btn.classList.toggle('open', opening);
            _isOpen = opening;
            badge.classList.remove('visible');

            if (opening) {
                updatePageTag();
                box.style.animation = 'none';
                void box.offsetWidth;
                box.style.animation = '';
                // Renderizar ANTES de guardar el estado de UI: si se guardara primero,
                // se perdería la referencia de "última página" antes de poder compararla.
                if (!msgs.querySelector('.vn-m')) _renderActiveConversation();
                setTimeout(() => input.focus(), 200);
            }
            _saveUiState();
        });

        close.addEventListener('click', () => {
            box.style.display = 'none';
            btn.classList.remove('open');
            _isOpen = false;
            closeMenu();
            _saveUiState();
            updateBadge();
        });

        newChatB.addEventListener('click', () => {
            _persistActiveConversation(); // conserva la conversación actual en el historial (si tenía contenido)
            activeConvId = _newConvId();
            _setActiveId(activeConvId);
            history = [];
            sugs.innerHTML = '';
            _renderActiveConversation();
            updateBadge();
            closeMenu();
        });

        clearB.addEventListener('click', () => {
            _saveConversations([]); // elimina TODAS las conversaciones guardadas
            activeConvId = _newConvId();
            _setActiveId(activeConvId);
            history = [];
            sugs.innerHTML = '';
            badge.classList.remove('visible');
            _renderActiveConversation();
        });

        exportB.addEventListener('click', () => {
            const visible = history.filter(h => !h._hidden);
            if (!visible.length) return;
            if (typeof VDS === 'undefined' || !VDS.downloadAsWord) return;
            const stamp = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
            // Cada turno como sección con encabezado (## Tú / ## VALL-AI) — el conversor a
            // Word los pinta como títulos reales, y se conserva el markdown de las
            // respuestas del bot (negritas, listas, tablas) en vez de aplanarlo.
            const body = visible.map(h => `## ${h.role === 'user' ? 'Tú' : 'VALL-AI'}\n${h.text}`).join('\n\n');
            VDS.downloadAsWord(`VALL-AI_conversacion_${stamp.replace(/\//g, '-')}`, body,
                { title: 'Conversación completa' });
        });

        send.addEventListener('click', () => {
            if (isSending) { _userCancelled = true; _activeCtrl?.abort(); return; }
            doSend();
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });

        profileB.addEventListener('click', () => {
            const p = _loadProfile();
            const entries = Object.entries(p.topics).sort((a, b) => b[1] - a[1]);
            const topText = entries.length
                ? entries.map(([k, v]) => `${TOPIC_LABELS[k]?.label || k} (${v})`).join(', ')
                : 'aún no hay suficientes datos';
            const row = addMsg(`👤 **Tu perfil de intereses**: ${topText}\n👍 ${p.fb.up} · 👎 ${p.fb.down}\n\n_Esto solo se guarda en tu navegador (localStorage) y ayuda a VALL-AI a priorizar temas de tu interés y ajustar la extensión de sus respuestas._`, 'b');
            const resetBar = document.createElement('div');
            resetBar.className = 'vn-msg-actions';
            const resetBtn = document.createElement('button');
            resetBtn.className = 'vn-act-btn';
            resetBtn.innerHTML = '<i class="fas fa-trash"></i> Restablecer mi perfil';
            resetBtn.addEventListener('click', () => {
                localStorage.removeItem(PROFILE_KEY);
                resetBtn.disabled = true;
                addMsg('✅ Tu perfil de intereses fue restablecido.', 'sys');
            });
            resetBar.appendChild(resetBtn);
            (row.querySelector('.vn-col') || row).appendChild(resetBar);
        });

        neuronB.addEventListener('click', () => {
            const n = _loadNeuron();
            const total = n.votesTotal || 0;
            const row = addMsg(`🧠 **Aprendizaje de VALL-AI**\n\n${_neuronSummary()}\n\n_Cada vez que calificas una respuesta con 👍/👎, la neurona anota si tenía tablas, listas, encabezados, negritas y qué tan larga era. Cuando un patrón acumula suficientes votos con una tendencia clara, se lo indica a Gemini como instrucción de estilo para tus próximas respuestas. Todo se guarda solo en tu navegador._`, 'b');
            if (total > 0) {
                const resetBar = document.createElement('div');
                resetBar.className = 'vn-msg-actions';
                const resetBtn = document.createElement('button');
                resetBtn.className = 'vn-act-btn';
                resetBtn.innerHTML = '<i class="fas fa-trash"></i> Reiniciar aprendizaje';
                resetBtn.addEventListener('click', () => {
                    localStorage.removeItem(NEURON_KEY);
                    resetBtn.disabled = true;
                    addMsg('✅ El aprendizaje de estilo fue reiniciado.', 'sys');
                });
                resetBar.appendChild(resetBtn);
                (row.querySelector('.vn-col') || row).appendChild(resetBar);
            }
        });

        historyB.addEventListener('click', _openHistoryPanel);
        histBack.addEventListener('click', _closeHistoryPanel);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && histPanel.classList.contains('vn-hist-open')) {
                _closeHistoryPanel();
                return;
            }
            if (e.key === 'Escape' && menu.classList.contains('vn-menu-open')) {
                closeMenu();
                return;
            }
            if (e.key === 'Escape' && box.style.display !== 'none') {
                box.style.display = 'none';
                btn.classList.remove('open');
                _isOpen = false;
                _saveUiState();
                updateBadge();
            }
        });

        /* ── Cargar la conversación activa (o crear una nueva) ── */
        activeConvId = _getActiveId();
        const existingConvs = _loadConversations();
        const activeConv = existingConvs.find(c => c.id === activeConvId);
        if (activeConv) {
            history = activeConv.messages;
        } else {
            activeConvId = _newConvId();
            _setActiveId(activeConvId);
            history = [];
        }

        /* ── Restaurar estado de UI si venía de otra página ── */
        const ui = _loadUiState();
        if (ui.wasOpen) {
            box.style.display = 'flex';
            btn.classList.add('open');
            _isOpen = true;
            _renderActiveConversation();
            setTimeout(() => input.focus(), 300);
        } else if (history.length) {
            updateBadge();
        }
    }

    /* ── Init ──────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildWidget);
    } else {
        buildWidget();
    }
})();
