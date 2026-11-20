(function () {
    'use strict';

    /* Este script captura TODOS sus nodos en `els` al evaluarse, así que solo
       funciona si el DOM ya existe cuando se carga. En la SPA de React eso
       obliga a reejecutarlo en cada visita a /vall-ai: al volver, los nodos son
       nuevos y los `els` de la ejecución anterior apuntan a un DOM desechado.

       Reejecutar es barato (el navegador lo sirve de su caché), pero duplicaría
       los listeners de `document` y `window`, que sobreviven al cambio de
       página. Por eso cada ejecución desmonta la anterior antes de empezar y
       publica su propio desmontar() en window.VNVallAi. */
    window.VNVallAi?.desmontar?.();

    const session=window.VNOrionSession;
    if(!session?.owner || !session.current)return;
    const localStorage=session.storage,sessionStorage=session.sessionStorage;
    const fetch=(url,options)=>session.request(url,options);

    const _globales = [];
    const escucharGlobal = (destino, evento, fn) => {
        destino.addEventListener(evento, fn);
        _globales.push(() => destino.removeEventListener(evento, fn));
    };

    const PROFILE_SCOPE = encodeURIComponent(session.owner);
    const CONV_KEY = `vn_chat_conversations_v2_${PROFILE_SCOPE}`;
    const ACTIVE_KEY = `vn_chat_active_id_v2_${PROFILE_SCOPE}`;
    const DELETED_CONV_KEY = `vn_chat_deleted_ids_v1_${PROFILE_SCOPE}`;
    const PINNED_CONV_KEY = `vn_chat_pinned_ids_v1_${PROFILE_SCOPE}`;
    const SIDEBAR_KEY = 'vn_ai_sidebar_collapsed';
    const MAX_CONVERSATIONS = 40;
    const MAX_MESSAGES = 80;

    const $ = (id) => document.getElementById(id);
    const els = {
        shell: document.querySelector('.vai-shell'), sidebar: $('vaiSidebar'), sidebarCollapse: $('vaiSidebarCollapse'), overlay: $('vaiOverlay'), sideClose: $('vaiSideClose'),
        historyToggle: $('vaiHistoryToggle'), history: $('vaiHistory'), historySearch: $('vaiHistorySearch'), historySearchClear: $('vaiHistorySearchClear'), historyCount: $('vaiHistoryCount'), newChat: $('vaiNew'), quickSearch: $('vaiQuickSearch'),
        exportWrap: $('vaiExportWrap'), exportChat: $('vaiExportChat'), exportMenu: $('vaiExportMenu'),
        messages: $('vaiMessages'), scrollBottom: $('vaiScrollBottom'), welcome: $('vaiWelcome'),
        form: $('vaiForm'), slashMenu: $('vaiSlashMenu'), input: $('vaiInput'), send: $('vaiSend'), stop: $('vaiStop'), conversationFace: $('vaiConversationFace'), charCount: $('vaiCharCount'),
        attach: $('vaiAttach'), fileInput: $('vaiFileInput'), attachments: $('vaiAttachments'), dropzone: $('vaiDropzone'),
        reportStudio: $('vaiReportStudio'), reportTitle: $('vaiReportTitle'), reportScope: $('vaiReportScope'),
        reportFormat: $('vaiReportFormat'), reportZoom: $('vaiReportZoom'), reportEditor: $('vaiReportEditor'), reportSource: $('vaiReportSource'), reportPreview: $('vaiReportPreview'),
        reportRefresh: $('vaiReportRefresh'), reportExport: $('vaiReportExport'), reportWords: $('vaiReportWords'), reportStatus: $('vaiReportStatus'),
        reportSave: $('vaiReportSave'), reportLibrary: $('vaiReportLibrary'), reportBody: document.querySelector('.vai-report-body'),
        voiceOverlay: $('vaiVoiceOverlay'), voiceOrb: $('vaiVoiceOrb'), voiceStatus: $('vaiVoiceStatus'), voiceHangup: $('vaiVoiceHangup'),
        voiceUserTranscript: $('vaiVoiceUserTranscript'), voiceAiTranscript: $('vaiVoiceAiTranscript')
    };

    let conversations = loadConversations();
    let activeId = localStorage.getItem(ACTIVE_KEY) || '';
    let busy = false;
    let controller = null;
    let continuousVoiceMode = false;
    let autoListenCallback = null;
    let liveVoiceController = null;
    let liveVoiceStart = 0;
    let legacyVoiceStart = null;
    let legacyVoiceStop = null;
    let mermaidReady = null;
    let reportRenderTimer = null;
    const reportEditionMetadata = new Map();
    let activeReportContext = { key: 'latest', title: 'Reporte ORION', content: '', label: 'Última respuesta seleccionada' };
    let pendingFiles = [];
    const chartInstances = new WeakMap();
    const pendingPdfFiles = new WeakMap();
    const remoteSaveQueues = new Map();
    const deletedConversationIds = loadDeletedConversationIds();
    const pinnedConversationIds = loadPinnedConversationIds();
    let slashVisibleItems = [];
    let slashActiveIndex = 0;
    let slashDismissedValue = '';
    let exportBusy = false;
    let exportFeedbackTimer = null;

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    }

    const FACE_STATES = ['idle', 'listening', 'thinking', 'speaking'];
    const FACE_EXPRESSIONS = ['neutral', 'warm', 'confident', 'concerned', 'curious', 'attentive'];
    const FACE_VISEMES = ['rest', 'wide', 'round', 'closed', 'soft'];
    const FACE_LABELS = {
        idle: 'ORION disponible',
        listening: 'ORION te está escuchando',
        thinking: 'ORION está pensando su respuesta',
        speaking: 'ORION está respondiendo',
    };
    const THINKING_STAGES = {
        understand: { title: 'Comprendiendo la consulta', detail: 'Defino el tema, el periodo y la decisión que necesitas resolver.' },
        sources: { title: 'Consultando datos y fuentes', detail: 'Busco evidencia relevante y compruebo que las fechas coincidan.' },
        reasoning: { title: 'Preparando una respuesta clara', detail: 'Ordeno hallazgos, riesgos y próximos pasos antes de responder.' },
        fallback: { title: 'Ajustando la búsqueda', detail: 'Cambio de ruta para completar el análisis sin perder el contexto.' },
    };

    function assistantFaceMarkup() {
        return '<svg class="vai-orion-map" viewBox="0 0 100 116" aria-hidden="true" focusable="false"><g class="vai-orion-lines"><path d="M50 10 25 30 39 54 28 96"></path><path d="M50 10 73 29 62 50 72 98"></path><path d="M25 30 73 29"></path><path d="M39 54 50 52 62 50"></path><path d="M50 52 50 66 48 78"></path></g><g class="vai-orion-stars"><circle class="vai-orion-star star-meissa" cx="50" cy="10" r="3.2"></circle><circle class="vai-orion-star star-betelgeuse" cx="25" cy="30" r="4.5"></circle><circle class="vai-orion-star star-bellatrix" cx="73" cy="29" r="3.7"></circle><circle class="vai-orion-star star-alnitak" cx="39" cy="54" r="3.2"></circle><circle class="vai-orion-star star-alnilam" cx="50" cy="52" r="3.5"></circle><circle class="vai-orion-star star-mintaka" cx="62" cy="50" r="3"></circle><circle class="vai-orion-star star-sword-one" cx="50" cy="66" r="2.2"></circle><circle class="vai-orion-star star-sword-two" cx="48" cy="78" r="2.5"></circle><circle class="vai-orion-star star-saiph" cx="28" cy="96" r="3.6"></circle><circle class="vai-orion-star star-rigel" cx="72" cy="98" r="4.7"></circle></g></svg>';
    }

    function clearFaceClasses(face, names, prefix) {
        names.forEach(name => face.classList.remove(`${prefix}${name}`));
    }

    function setFaceExpression(face, expression = 'neutral') {
        if (!face) return;
        const next = FACE_EXPRESSIONS.includes(expression) ? expression : 'neutral';
        clearFaceClasses(face, FACE_EXPRESSIONS, 'vai-expression--');
        face.classList.add(`vai-expression--${next}`);
    }

    function expressionForText(value) {
        const text = String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        if (/\b(?:riesgo|caida|perdida|alerta|crisis|presion|amenaza|incertidumbre|debil|negativo)\b/.test(text)) return 'concerned';
        if (/\b(?:crece|crecimiento|sube|mejora|oportunidad|fortaleza|positivo|avance|recuperacion)\b/.test(text)) return 'warm';
        if (/\b(?:recomiendo|conclusion|conviene|prioridad|clave|decision|resultado)\b/.test(text)) return 'confident';
        if (/\b(?:por que|como|escenario|posibilidad|depende|analicemos)\b/.test(text)) return 'curious';
        return 'neutral';
    }

    function stopFacePerformance(face) {
        if (!face) return;
        clearTimeout(face._vaiPerformanceTimer);
        clearTimeout(face._vaiGestureTimer);
        clearTimeout(face._vaiBlinkTimer);
        face._vaiPerformanceTimer = null;
        face.classList.remove('vai-face--nod', 'vai-face--emphasis', 'vai-face--pause', 'vai-face--blink-now', 'vai-face--glance-left', 'vai-face--glance-right');
        clearFaceClasses(face, FACE_VISEMES, 'vai-viseme--');
    }

    function scheduleFacePerformance(face) {
        if (!face || face._vaiPerformanceTimer) return;
        const perform = () => {
            if (!face.classList.contains('vai-face--speaking')) {
                face._vaiPerformanceTimer = null;
                return;
            }
            face.classList.remove('vai-face--nod', 'vai-face--glance-left', 'vai-face--glance-right', 'vai-face--blink-now');
            const choice = Math.random();
            if (choice < .22) face.classList.add('vai-face--nod');
            else if (choice < .42) face.classList.add(Math.random() > .5 ? 'vai-face--glance-left' : 'vai-face--glance-right');
            else if (choice < .54) face.classList.add('vai-face--blink-now');
            face._vaiGestureTimer = setTimeout(() => {
                face.classList.remove('vai-face--nod', 'vai-face--glance-left', 'vai-face--glance-right', 'vai-face--blink-now');
            }, 360);
            face._vaiPerformanceTimer = setTimeout(perform, 720 + Math.random() * 1250);
        };
        face._vaiPerformanceTimer = setTimeout(perform, 480 + Math.random() * 620);
    }

    function setFaceState(face, state = 'idle') {
        if (!face) return;
        const next = FACE_STATES.includes(state) ? state : 'idle';
        FACE_STATES.forEach((name) => face.classList.remove(`vai-face--${name}`));
        if (next !== 'speaking') {
            face.classList.remove('vai-face--syllable');
            stopFacePerformance(face);
        }
        face.classList.add(`vai-face--${next}`);
        if (next === 'speaking') scheduleFacePerformance(face);
        else if (next === 'listening') setFaceExpression(face, 'attentive');
        else if (next === 'thinking') setFaceExpression(face, 'curious');
        else setFaceExpression(face, 'neutral');
        face.setAttribute('aria-label', FACE_LABELS[next]);
    }

    function setConversationFaceState(state) {
        setFaceState(els.conversationFace, state);
    }

    function renderThinkingTools(pending, meta) {
        const container = pending?.bubble?.querySelector('[data-vai-thinking-tools]');
        if (!container) return;
        const tools = Array.isArray(meta?.tools) ? meta.tools.filter(Boolean) : [];
        if (!tools.length) {
            container.hidden = true;
            container.replaceChildren();
            return;
        }
        const completed = new Set(Array.isArray(meta?.completedTools) ? meta.completedTools : []);
        container.replaceChildren();
        tools.slice(0, 5).forEach((toolName) => {
            const done = completed.has(toolName);
            const pill = document.createElement('span');
            pill.className = `vai-tool-pill ${done ? 'is-done' : 'is-running'}`;
            const icon = document.createElement('i');
            icon.className = done ? 'fas fa-check' : 'fas fa-circle-notch fa-spin';
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = toolName;
            pill.append(icon, label);
            container.appendChild(pill);
        });
        container.hidden = false;
    }

    function setThinkingStage(pending, stage = 'understand', meta = null) {
        if (!pending?.bubble) return;
        const copy = THINKING_STAGES[stage] || THINKING_STAGES.reasoning;
        if (meta && (meta.detail || (Array.isArray(meta.tools) && meta.tools.length))) {
            pending._hasServerStatus = true;
        }
        const title = pending.bubble.querySelector('[data-vai-thinking-title]');
        const detail = pending.bubble.querySelector('[data-vai-thinking-detail]');
        if (title) title.textContent = copy.title;
        if (detail) detail.textContent = meta?.detail || copy.detail;
        if (meta && Array.isArray(meta.tools)) renderThinkingTools(pending, meta);
        setFaceState(pending.avatar, 'thinking');
        setConversationFaceState('thinking');
    }

    function cancelStreamingRender(pending) {
        if (!pending) return;
        if (pending._streamFrame) cancelAnimationFrame(pending._streamFrame);
        clearTimeout(pending._streamTimer);
        pending._streamFrame = null;
        pending._streamTimer = null;
    }

    function sanitizeStreamingMarkdown(text) {
        const raw = String(text || '');
        const lastOpen = raw.lastIndexOf('```');
        if (lastOpen < 0) return raw;
        const afterOpen = raw.slice(lastOpen + 3);
        const fenceMatch = afterOpen.match(/^(chart|mermaid)\b[^\n]*\n([\s\S]*)$/i);
        if (!fenceMatch) return raw;
        const kind = fenceMatch[1].toLowerCase();
        const notice = kind === 'chart'
            ? '\n\n> **Visualización interactiva:** preparando datos y escalas de la gráfica…\n'
            : '\n\n> **Diagrama estructural:** trazando nodos de la respuesta…\n';
        return raw.slice(0, lastOpen).trimEnd() + notice;
    }

    function ensureStreamingContainers(pending) {
        if (pending._streamBody && pending._streamBody.parentNode === pending.bubble) {
            return pending._streamBody;
        }
        pending.bubble.replaceChildren();
        const body = document.createElement('div');
        body.className = 'vai-stream-body';
        const live = document.createElement('div');
        live.className = 'vai-stream-live-pill';
        live.setAttribute('aria-live', 'off');
        live.innerHTML = '<span class="vai-stream-dot" aria-hidden="true"></span><span>Generando respuesta en vivo…</span>';
        pending.bubble.append(body, live);
        pending._streamBody = body;
        pending._streamLive = live;
        return body;
    }

    function renderStreamingText(pending, value, flush = false) {
        if (!pending?.bubble) return;
        pending._streamText = String(value || '');
        const paint = () => {
            pending._streamFrame = null;
            pending._streamTimer = null;
            if (!pending.row?.isConnected) return;
            if (!flush && !pending.row.classList.contains('is-streaming')) return;
            pending._lastStreamPaint = Date.now();
            const body = ensureStreamingContainers(pending);
            body.innerHTML = markdown(sanitizeStreamingMarkdown(pending._streamText));
        };
        if (flush) {
            cancelStreamingRender(pending);
            paint();
            return;
        }
        if (pending._streamFrame || pending._streamTimer) return;
        // Gemini puede entregar varios fragmentos pequeños de golpe. Pintar
        // cada uno reconstruía el Markdown completo y congelaba el chat.
        const elapsed = Date.now() - Number(pending._lastStreamPaint || 0);
        const defer = Math.max(0, 85 - elapsed);
        const schedule = () => { pending._streamFrame = requestAnimationFrame(paint); };
        if (defer) pending._streamTimer = setTimeout(schedule, defer);
        else schedule();
    }

    function animateFaceSpeech(face, duration = 720, text = '') {
        if (!face) return;
        setFaceState(face, 'speaking');
        setFaceExpression(face, expressionForText(text));
        clearTimeout(face._vaiFaceTimer);
        clearTimeout(face._vaiSyllableTimer);
        face._vaiFaceTimer = setTimeout(() => setFaceState(face, 'idle'), duration);
    }

    // Un golpe de boca breve al leer una palabra. La clase se usa con los
    // eventos `boundary` de voz; así el gesto acompaña la frase y no un bucle
    // constante que parezca mecánico.
    function cueFaceSyllable(face, duration = 145, viseme = '') {
        if (!face) return;
        const selected = FACE_VISEMES.includes(viseme) ? viseme : FACE_VISEMES[1 + Math.floor(Math.random() * (FACE_VISEMES.length - 1))];
        clearFaceClasses(face, FACE_VISEMES, 'vai-viseme--');
        face.classList.remove('vai-face--syllable');
        void face.offsetWidth;
        face.classList.add(`vai-viseme--${selected}`);
        face.classList.add('vai-face--syllable');
        clearTimeout(face._vaiSyllableTimer);
        face._vaiSyllableTimer = setTimeout(() => {
            face.classList.remove('vai-face--syllable');
            clearFaceClasses(face, FACE_VISEMES, 'vai-viseme--');
            face.classList.add('vai-viseme--rest');
        }, duration);
    }

    function visemeForBoundary(text, event = {}) {
        const start = Number(event.charIndex || 0);
        const fragment = String(text || '').slice(start, start + Math.max(Number(event.charLength || 0), 12));
        const word = (fragment.match(/[\p{L}\p{N}]+/u) || [''])[0].toLowerCase();
        if (/^[bmp]/.test(word)) return 'closed';
        if (/^[fvsxz]/.test(word)) return 'soft';
        if (/[ouóú]/.test(word)) return 'round';
        if (/[aeiáéí]/.test(word)) return 'wide';
        return 'rest';
    }

    function cueFaceBoundary(face, text, event = {}) {
        if (!face) return;
        const viseme = visemeForBoundary(text, event);
        const start = Number(event.charIndex || 0);
        const before = String(text || '').slice(Math.max(0, start - 2), start + 1);
        face.classList.toggle('vai-face--emphasis', /[!?:;]/.test(before));
        face.classList.toggle('vai-face--pause', /[,.!?;]/.test(before));
        cueFaceSyllable(face, viseme === 'closed' ? 115 : 165, viseme);
        clearTimeout(face._vaiEmphasisTimer);
        face._vaiEmphasisTimer = setTimeout(() => face.classList.remove('vai-face--emphasis', 'vai-face--pause'), 280);
    }

    function loadConversations() {
        try {
            const value = JSON.parse(localStorage.getItem(CONV_KEY) || '[]');
            return Array.isArray(value) ? value
                .filter((item) => item && item.id && Array.isArray(item.messages))
                .map((item) => ({ ...item, messages: item.messages.map(ensureMessageIdentity) })) : [];
        } catch { return []; }
    }

    function isConversationPinned(id) {
        return pinnedConversationIds.has(String(id || ''));
    }

    function sortConversationsList(list) {
        return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
            const pinDiff = Number(isConversationPinned(b?.id)) - Number(isConversationPinned(a?.id));
            if (pinDiff !== 0) return pinDiff;
            return Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0);
        });
    }

    function saveConversations() {
        const ordered = sortConversationsList(conversations);
        const pinned = ordered.filter(item => isConversationPinned(item?.id));
        const unpinned = ordered.filter(item => !isConversationPinned(item?.id));
        const unpinnedLimit = Math.max(0, MAX_CONVERSATIONS - Math.min(pinned.length, MAX_CONVERSATIONS - 5));
        conversations = [...pinned, ...unpinned.slice(0, unpinnedLimit)];
        localStorage.setItem(CONV_KEY, JSON.stringify(conversations));
    }

    function hasConversationMessages(conversation) {
        return Array.isArray(conversation?.messages)
            && conversation.messages.some(message => !message?._hidden && String(message?.text || '').trim());
    }

    function loadDeletedConversationIds() {
        try {
            const value = JSON.parse(localStorage.getItem(DELETED_CONV_KEY) || '[]');
            return new Set(Array.isArray(value) ? value.filter(Boolean).map(String).slice(-200) : []);
        } catch { return new Set(); }
    }

    function saveDeletedConversationIds() {
        localStorage.setItem(DELETED_CONV_KEY, JSON.stringify([...deletedConversationIds].slice(-200)));
    }

    function loadPinnedConversationIds() {
        try {
            const value = JSON.parse(localStorage.getItem(PINNED_CONV_KEY) || '[]');
            return new Set(Array.isArray(value) ? value.filter(Boolean).map(String).slice(-MAX_CONVERSATIONS) : []);
        } catch { return new Set(); }
    }

    function savePinnedConversationIds() {
        localStorage.setItem(PINNED_CONV_KEY, JSON.stringify([...pinnedConversationIds].slice(-MAX_CONVERSATIONS)));
    }

    function toggleConversationPin(id) {
        const conversationId = String(id || '');
        if (!conversationId) return;
        if (pinnedConversationIds.has(conversationId)) pinnedConversationIds.delete(conversationId);
        else pinnedConversationIds.add(conversationId);
        savePinnedConversationIds();
        saveConversations();
        renderHistory();
    }

    function queueRemoteConversationRequest(conversationId, request) {
        const previous = remoteSaveQueues.get(conversationId) || Promise.resolve();
        const next = previous.catch(() => {}).then(()=>session.current ? request() : undefined).catch(() => {}).finally(() => {
            if (remoteSaveQueues.get(conversationId) === next) remoteSaveQueues.delete(conversationId);
        });
        remoteSaveQueues.set(conversationId, next);
        return next;
    }

    function remoteConversationPayload(conversation) {
        return {
            id: String(conversation.id || '').slice(0, 100),
            title: String(conversation.title || 'Nueva conversación').slice(0, 160),
            messages: Array.isArray(conversation.messages) ? conversation.messages.slice(-MAX_MESSAGES) : [],
            updatedAt: Number(conversation.updatedAt || Date.now()),
        };
    }

    function saveConversationToProfile(conversation) {
        const conversationId = String(conversation.id || '');
        if (!conversationId || deletedConversationIds.has(conversationId)) return Promise.resolve();
        const body = JSON.stringify({ conversation: remoteConversationPayload(conversation) });
        return queueRemoteConversationRequest(conversationId, () => fetch('/api/chat-conversations', {
            method: 'POST', credentials: 'include', keepalive: true,
            headers: { 'Content-Type': 'application/json' }, body,
        }).then(response => {
            if (!response.ok) throw new Error('No se pudo guardar la conversación.');
        }));
    }

    function deleteConversationFromProfile(conversationId) {
        return queueRemoteConversationRequest(conversationId, () => fetch('/api/chat-conversations/delete', {
            method: 'POST', credentials: 'include', keepalive: true,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId }),
        }).then(response => {
            if (!response.ok) throw new Error('No se pudo eliminar la conversación.');
        }));
    }

    async function syncProfileConversations() {
        try {
            const response = await fetch('/api/chat-conversations', { credentials: 'include', cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));
            if(!session.current)return;
            if (!response.ok || !Array.isArray(payload.data)) return;
            if (payload.data.length) {
                const activeBeforeSync = activeId;
                const localById = new Map(conversations
                    .filter(item => !deletedConversationIds.has(String(item.id)))
                    .map(item => [item.id, item]));
                const remote = payload.data.map(item => ({
                    ...item,
                    messages: Array.isArray(item.messages) ? item.messages.map(ensureMessageIdentity) : [],
                    updatedAt: Number(item.updatedAt || Date.now()),
                })).filter(item => !deletedConversationIds.has(String(item.id)));
                const remoteById = new Map(remote.map(item => [item.id, item]));
                // Nunca sustituir una conversación local más reciente —ni una
                // conversación nueva todavía vacía— por el primer hilo que
                // responda Supabase al volver a la página.
                const ids = new Set([...localById.keys(), ...remoteById.keys()]);
                conversations = [...ids].map(id => {
                    const local = localById.get(id);
                    const server = remoteById.get(id);
                    if (!local) return server;
                    if (!server) return local;
                    // Un borrador vacío de esta pestaña nunca debe ocultar una
                    // conversación real que Supabase ya tiene completa.
                    if (!hasConversationMessages(local) && hasConversationMessages(server)) return server;
                    return Number(local.updatedAt || 0) >= Number(server.updatedAt || 0) ? local : server;
                }).filter(Boolean);
                if (activeBeforeSync && conversations.some(item => item.id === activeBeforeSync)) activeId = activeBeforeSync;
                else activeId = sortConversationsList(conversations.filter(hasConversationMessages))[0]?.id || '';
                saveConversations();
                if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
                // Mientras ORION genera, el mensaje de espera existe solo en
                // el DOM. Redibujar aquí lo borraba antes de que la respuesta
                // llegara y la respuesta terminaba escrita en un nodo antiguo.
                // El estado local ya se fusionó; la vista se actualiza al
                // finalizar el turno.
                if (!busy) renderConversation();
                renderHistory();
            } else if (conversations.length) conversations.forEach(saveConversationToProfile);
        } catch { /* La copia local conserva el chat si la red se interrumpe. */ }
    }

    function newId() { return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
    function newMessageId() { return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10); }
    function ensureMessageIdentity(message) {
        if (!message || typeof message !== 'object') return message;
        if (!message.id) message.id = newMessageId();
        return message;
    }
    function activeConversation() { return conversations.find((item) => item.id === activeId) || null; }
    function conversationTitle(messages) {
        const first = messages.find((message) => message.role === 'user' && !message._hidden);
        const text = String(first?.text || '').replace(/\s+/g, ' ').trim();
        return text ? (text.length > 48 ? text.slice(0, 48) + '…' : text) : 'Nueva conversación';
    }

    function ensureConversation() {
        let conversation = activeConversation();
        if (!conversation) {
            activeId = newId();
            localStorage.setItem(ACTIVE_KEY, activeId);
            conversation = { id: activeId, title: 'Nueva conversación', messages: [], updatedAt: Date.now() };
        }
        return conversation;
    }

    function persistConversation(conversation) {
        if(!session.current)return;
        conversation.title = conversationTitle(conversation.messages);
        conversation.updatedAt = Date.now();
        conversation.messages = conversation.messages.slice(-MAX_MESSAGES).map(ensureMessageIdentity);
        const index = conversations.findIndex((item) => item.id === conversation.id);
        if (index < 0) conversations.unshift(conversation); else conversations[index] = conversation;
        activeId = conversation.id;
        localStorage.setItem(ACTIVE_KEY, activeId);
        saveConversations();
        saveConversationToProfile(conversation);
        renderHistory();
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp || Date.now());
        const diff = Date.now() - date.getTime();
        if (diff < 86400000 && date.getDate() === new Date().getDate()) return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        if (diff < 604800000) return date.toLocaleDateString('es-MX', { weekday: 'short' });
        return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    }

    function renameConversation(id, row) {
        const conversation = conversations.find((item) => item.id === id);
        const titleNode = row?.querySelector('.vai-history-copy strong');
        if (!conversation || !titleNode || row.querySelector('.vai-history-edit')) return;
        const editor = document.createElement('input');
        editor.type = 'text';
        editor.className = 'vai-history-edit';
        editor.maxLength = 80;
        editor.value = conversation.title || '';
        editor.setAttribute('aria-label', 'Nuevo título de conversación');
        titleNode.hidden = true;
        titleNode.after(editor);
        let settled = false;
        const finish = (commit) => {
            if (settled) return;
            settled = true;
            const nextTitle = editor.value.trim();
            editor.remove();
            titleNode.hidden = false;
            if (commit && nextTitle && nextTitle !== conversation.title) {
                conversation.title = nextTitle.slice(0, 80);
                persistConversation(conversation);
            }
            renderHistory();
        };
        editor.addEventListener('click', (event) => event.stopPropagation());
        editor.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') { event.preventDefault(); finish(true); }
            else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        });
        editor.addEventListener('blur', () => finish(true));
        editor.focus();
        editor.select();
    }

    function createHistoryRow(conversation) {
        const pinned = isConversationPinned(conversation.id);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'vai-history-item' + (conversation.id === activeId ? ' active' : '') + (pinned ? ' is-pinned' : '');
        row.dataset.id = conversation.id;
        row.title = `${conversation.title} · ${formatDate(conversation.updatedAt)}`;
        row.innerHTML = `<span class="vai-history-icon"><i class="far fa-message"></i></span><span class="vai-history-copy"><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(formatDate(conversation.updatedAt))}</small></span><span class="vai-history-actions"><span class="vai-history-pin${pinned ? ' is-pinned' : ''}" role="button" tabindex="0" aria-label="${pinned ? 'Desfijar conversación' : 'Fijar conversación'}" aria-pressed="${pinned ? 'true' : 'false'}" title="${pinned ? 'Desfijar' : 'Fijar'}"><i class="fas fa-thumbtack"></i></span><span class="vai-history-rename" role="button" aria-label="Renombrar conversación" title="Renombrar"><i class="fas fa-pen"></i></span><span class="vai-history-remove" role="button" aria-label="Eliminar conversación" title="Eliminar"><i class="fas fa-xmark"></i></span></span>`;
        row.addEventListener('click', (event) => {
            if (event.target.closest('.vai-history-remove')) { event.stopPropagation(); deleteConversation(conversation.id); return; }
            if (event.target.closest('.vai-history-rename')) { event.stopPropagation(); renameConversation(conversation.id, row); return; }
            if (event.target.closest('.vai-history-pin')) { event.stopPropagation(); toggleConversationPin(conversation.id); return; }
            activeId = conversation.id;
            localStorage.setItem(ACTIVE_KEY, activeId);
            renderConversation();
            renderHistory();
            closeSidebar();
        });
        row.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const pinButton = event.target.closest('.vai-history-pin');
            if (!pinButton) return;
            event.preventDefault();
            event.stopPropagation();
            toggleConversationPin(conversation.id);
        });
        return row;
    }

    function renderHistory() {
        const query = els.historySearch.value.trim().toLowerCase();
        if (els.historySearchClear) els.historySearchClear.hidden = !els.historySearch.value.length;
        syncExportChatAvailability();
        // "Nueva conversación" es un borrador de composición, no parte del
        // historial. Solo se vuelve un hilo al enviar el primer mensaje.
        const visible = sortConversationsList(conversations.filter((item) => hasConversationMessages(item))
            .filter((item) => !query || item.title.toLowerCase().includes(query) || item.messages.some((message) => String(message.text || '').toLowerCase().includes(query))));
        els.historyCount.textContent = String(visible.length);
        els.history.replaceChildren();
        if (!visible.length) {
            const empty = document.createElement('div');
            empty.className = 'vai-history-empty';
            empty.innerHTML = query ? '<i class="fas fa-magnifying-glass"></i><br>No se encontraron conversaciones.' : '<i class="far fa-message"></i><br>Tu historial aparecerá aquí después de la primera pregunta.';
            els.history.appendChild(empty);
            return;
        }
        const pinnedVisible = visible.filter((item) => isConversationPinned(item.id));
        const unpinnedVisible = visible.filter((item) => !isConversationPinned(item.id));
        const appendGroup = (items, label) => {
            if (!items.length) return;
            if (label) {
                const heading = document.createElement('div');
                heading.className = 'vai-history-group-label';
                heading.textContent = label;
                els.history.appendChild(heading);
            }
            items.forEach((conversation) => els.history.appendChild(createHistoryRow(conversation)));
        };
        if (pinnedVisible.length) {
            appendGroup(pinnedVisible, 'Fijados');
            appendGroup(unpinnedVisible, unpinnedVisible.length ? 'Recientes' : '');
        } else {
            appendGroup(unpinnedVisible, '');
        }
    }

    function deleteConversation(id) {
        const conversationId = String(id || '');
        if (!conversationId) return;
        // Conservamos una marca local para que una respuesta remota anterior al
        // borrado no vuelva a mostrar el hilo mientras la petición termina.
        deletedConversationIds.add(conversationId);
        saveDeletedConversationIds();
        if (pinnedConversationIds.delete(conversationId)) savePinnedConversationIds();
        conversations = conversations.filter((item) => item.id !== conversationId);
        saveConversations();
        // El borrado se encola después de cualquier guardado ya iniciado para
        // este mismo hilo; así no puede reaparecer por una carrera de red.
        deleteConversationFromProfile(conversationId);
        if (conversationId === activeId) {
            // No crear un hilo fantasma: el usuario debe poder vaciar todo el
            // historial. El siguiente mensaje creará una conversación nueva.
            activeId = '';
            localStorage.removeItem(ACTIVE_KEY);
            renderConversation();
        }
        renderHistory();
    }

    function startNewConversation() {
        if (busy) return;
        closeSlashMenu();
        closeExportMenu();
        activeId = newId();
        const conversation = { id: activeId, title: 'Nueva conversación', messages: [], updatedAt: Date.now() };
        conversations.unshift(conversation);
        localStorage.setItem(ACTIVE_KEY, activeId);
        saveConversations();
        // El borrador se conserva localmente y la fusión remota lo respeta,
        // pero no se sube ni se muestra en historial hasta tener contenido.
        renderConversation();
        renderHistory();
        closeSidebar();
        els.input.focus();
    }

    function markdown(value) {
        const normalized = String(value || '')
            .replace(/&#x20;|&nbsp;/gi, ' ')
            .replace(/\[([^\]]+)\]\\?\(\[https?:\/\/[^\]]+\]\((https?:\/\/[^)\s]+)\)\)/g, '[$1]($2)')
            .replace(/\[([^\]]+)\]\(<(https?:\/\/[^<>\s]+)>\)/g, '[$1]($2)')
            .replace(/\\([*_[\]()#>|`~-])/g, '$1');
        let text = escapeHtml(normalized);
        const codeBlocks = [];
        text = text.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, language, code) => {
            const langLabel = escapeHtml(language || 'código');
            const index = codeBlocks.push(`<div class="vai-code-block"><div class="vai-code-head"><span class="vai-code-lang">${langLabel}</span><button type="button" class="vai-code-copy"><i class="far fa-copy"></i><span>Copiar código</span></button></div><pre><code data-language="${escapeHtml(language || 'text')}">${code}</code></pre></div>`) - 1;
            return `\n@@VAI_CODE_${index}@@\n`;
        });
        const links = [];
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
            const index = links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`) - 1;
            return `@@VAI_LINK_${index}@@`;
        });
        text = text
            .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
            .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^#\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^&gt;\s?(.+)$/gm, '<div class="vai-quote">$1</div>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
        links.forEach((anchor, index) => { text = text.replace(`@@VAI_LINK_${index}@@`, anchor); });
        const lines = text.split('\n');
        let html = '', list = '', listTag = 'ul';
        const flush = () => { if (list) { html += `<${listTag}>${list}</${listTag}>`; list = ''; listTag = 'ul'; } };
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            let separatorIndex = index + 1;
            while (separatorIndex < lines.length && !lines[separatorIndex].trim()) separatorIndex += 1;
            if (line.includes('|') && /^\s*\|?\s*:?-{2,}/.test(lines[separatorIndex] || '')) {
                flush();
                const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
                const headers = cells(line); const rows = []; index = separatorIndex + 1;
                while (index < lines.length) {
                    if (!lines[index].trim()) { index += 1; continue; }
                    if (!lines[index].includes('|')) break;
                    rows.push(cells(lines[index])); index += 1;
                }
                index -= 1;
                html += `<div class="vai-table-box"><div class="vai-table-toolbar"><span>Tabla comparativa</span><button type="button" class="vai-table-copy"><i class="far fa-copy"></i><span>Copiar tabla</span></button></div><div class="vai-table-scroll" style="overflow-x:auto"><table class="vai-data-table"><thead><tr>${headers.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
                continue;
            }
            const bullet = line.match(/^\s*[-•]\s+(.+)/);
            const ordered = line.match(/^\s*\d+\.\s+(.+)/);
            if (bullet || ordered) {
                const requestedTag = ordered ? 'ol' : 'ul';
                if (list && listTag !== requestedTag) flush();
                listTag = requestedTag; list += `<li>${(bullet || ordered)[1]}</li>`; continue;
            }
            flush();
            if (!line.trim()) continue;
            if (/^<(?:h[2-4]|pre|div)/.test(line)) html += line;
            else if (/^@@VAI_CODE_\d+@@$/.test(line.trim())) html += line.trim();
            else html += `<p>${line}</p>`;
        }
        flush();
        codeBlocks.forEach((block, index) => { html = html.replace(`@@VAI_CODE_${index}@@`, block); });
        return html;
    }

    function inlineMarkdown(value) {
        const links = [];
        let html = escapeHtml(String(value || '')).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
            const index = links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`) - 1;
            return `@@VAI_ILINK_${index}@@`;
        });
        html = html
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
        links.forEach((anchor, index) => { html = html.replace(`@@VAI_ILINK_${index}@@`, anchor); });
        return html;
    }

    function renderRich(container, response, fallback) {
        if (!response || !Array.isArray(response.blocks) || !response.blocks.length) {
            renderLegacyContent(container, fallback);
            return;
        }
        container.replaceChildren();
        if (response.summary) {
            const summary = document.createElement('section');
            summary.className = 'vai-rich-summary';
            summary.innerHTML = `<small><i class="fas fa-bolt"></i> Lectura clave</small>${markdown(response.summary)}`;
            container.appendChild(summary);
        }
        response.blocks.forEach((block) => {
            if (!block || typeof block !== 'object') return;
            let node;
            if (block.type === 'heading') {
                node = document.createElement(block.level >= 4 ? 'h4' : block.level === 3 ? 'h3' : 'h2');
                node.textContent = block.content;
            } else if (block.type === 'text' || block.type === 'markdown') {
                node = document.createElement('div'); node.innerHTML = markdown(block.content);
            } else if (block.type === 'code') {
                node = document.createElement('pre'); const code = document.createElement('code'); code.textContent = block.content; node.appendChild(code);
            } else if (block.type === 'table') {
                node = document.createElement('div'); node.className = 'vai-table-box';
                const toolbar = document.createElement('div'); toolbar.className = 'vai-table-toolbar';
                toolbar.innerHTML = '<span>Tabla comparativa</span><button type="button" class="vai-table-copy"><i class="far fa-copy"></i><span>Copiar tabla</span></button>';
                const scrollWrap = document.createElement('div'); scrollWrap.className = 'vai-table-scroll'; scrollWrap.style.overflowX = 'auto';
                const table = document.createElement('table');
                table.className = 'vai-data-table';
                const head = document.createElement('tr'); (block.headers || []).forEach((value) => { const th = document.createElement('th'); th.textContent = value; head.appendChild(th); });
                const thead = document.createElement('thead'); thead.appendChild(head); table.appendChild(thead);
                const tbody = document.createElement('tbody'); (Array.isArray(block.rows) ? block.rows : []).forEach((row) => { if (!Array.isArray(row)) return; const tr = document.createElement('tr'); row.forEach((value) => { const td = document.createElement('td'); td.innerHTML = inlineMarkdown(value); tr.appendChild(td); }); tbody.appendChild(tr); });
                table.appendChild(tbody); scrollWrap.appendChild(table); node.append(toolbar, scrollWrap);
            } else if (block.type === 'alert') {
                const severity = ['warning', 'error', 'success'].includes(block.severity) ? block.severity : 'info';
                const icon = severity === 'error' ? 'fa-circle-exclamation' : severity === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
                node = document.createElement('div');
                node.className = `vai-alert vai-alert--${severity}`;
                node.innerHTML = `${block.title ? `<strong class="vai-alert-title"><i class="fas ${icon}" aria-hidden="true"></i> ${escapeHtml(block.title)}</strong>` : ''}<div class="vai-alert-body">${markdown(block.content)}</div>`;
            } else if (block.type === 'quote') {
                node = document.createElement('div'); node.className = 'vai-quote'; node.textContent = block.content;
            } else if (block.type === 'steps' || block.type === 'checklist') {
                node = document.createElement(block.type === 'steps' ? 'ol' : 'ul');
                (Array.isArray(block.items) ? block.items : []).forEach((item) => {
                    const li = document.createElement('li');
                    const isObj = item && typeof item === 'object';
                    const marker = block.type === 'checklist' ? (isObj && item.checked ? '✓ ' : '○ ') : '';
                    li.innerHTML = `${marker}${inlineMarkdown(isObj ? item.text : item)}`;
                    node.appendChild(li);
                });
            } else if (block.type === 'diagram') {
                node = document.createElement('div'); node.className = 'mermaid'; node.textContent = block.content; hydrateMermaid(node);
            } else if (block.type === 'chart') {
                node = createAdvancedChart(block.spec || {});
            } else if (block.type === 'formula') {
                node = document.createElement('pre'); node.textContent = block.content;
            } else if (block.type === 'comparison') {
                node = document.createElement('section'); node.className = 'vai-rich-comparison';
                if (block.title) { const title = document.createElement('h3'); title.textContent = block.title; node.appendChild(title); }
                const grid = document.createElement('div'); grid.className = 'vai-rich-comparison-grid';
                (block.items || []).forEach((item) => {
                    const card = document.createElement('article');
                    const title = document.createElement('strong'); title.textContent = item.title || '';
                    const content = document.createElement('p'); content.textContent = item.content || '';
                    card.append(title, content);
                    const addList = (label, values, className) => {
                        if (!Array.isArray(values) || !values.length) return;
                        const heading = document.createElement('small'); heading.className = className; heading.textContent = label;
                        const list = document.createElement('ul');
                        values.forEach((value) => { const li = document.createElement('li'); li.textContent = value; list.appendChild(li); });
                        card.append(heading, list);
                    };
                    addList('A favor', item.pros, 'positive'); addList('A considerar', item.cons, 'caution');
                    grid.appendChild(card);
                });
                node.appendChild(grid);
            } else if (block.type === 'document') {
                node = document.createElement('article'); node.className = 'vai-rich-document';
                if (block.title) { const title = document.createElement('h2'); title.textContent = block.title; node.appendChild(title); }
                (block.sections || []).forEach((section) => {
                    const part = document.createElement('section');
                    if (section.title) { const title = document.createElement('h3'); title.textContent = section.title; part.appendChild(title); }
                    const content = document.createElement('div'); content.innerHTML = markdown(section.content || ''); part.appendChild(content); node.appendChild(part);
                });
            } else {
                node = document.createElement('div'); node.innerHTML = markdown(block.content || block.description || '');
            }
            container.appendChild(node);
        });
    }

    function renderLegacyContent(container, content) {
        container.replaceChildren();
        const source = String(content || '');
        const fence = /```(chart|mermaid)\s*\n([\s\S]*?)```/gi;
        let last = 0, match;
        const addMarkdown = (part) => {
            if (!part.trim()) return;
            const block = document.createElement('div'); block.innerHTML = markdown(part); container.appendChild(block);
        };
        while ((match = fence.exec(source))) {
            addMarkdown(source.slice(last, match.index));
            if (match[1].toLowerCase() === 'chart') {
                try { container.appendChild(createAdvancedChart(JSON.parse(match[2].trim()))); }
                catch { addMarkdown('```json\n' + match[2] + '\n```'); }
            } else {
                const diagram = document.createElement('div'); diagram.className = 'mermaid'; diagram.textContent = match[2].trim(); container.appendChild(diagram); hydrateMermaid(diagram);
            }
            last = fence.lastIndex;
        }
        addMarkdown(source.slice(last));
    }

    async function hydrateMermaid(node) {
        try {
            if (!mermaidReady) mermaidReady = new Promise((resolve, reject) => {
                if (window.mermaid) return resolve(window.mermaid);
                const script = document.createElement('script'); script.src = '/assets/js/vendor/mermaid.min.js'; script.onload = () => resolve(window.mermaid); script.onerror = reject; document.head.appendChild(script);
            });
            const mermaid = await mermaidReady;
            mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
            await mermaid.run({ nodes: [node] });
        } catch {
            if (!window.mermaid) mermaidReady = null;
            node.classList.remove('mermaid');
            node.innerHTML = `<pre><code>${escapeHtml(node.textContent)}</code></pre>`;
        }
    }

    function normalizeChartSpec(raw) {
        const allowed = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea']);
        const views = new Set(['bar', 'horizontalBar', 'stackedBar', 'line', 'area', 'mixed', 'pie', 'doughnut', 'radar', 'polarArea']);
        const source = raw && typeof raw === 'object' ? raw : {};
        const sourceLabels = Array.isArray(source.labels) ? source.labels : (source.data && Array.isArray(source.data.labels) ? source.data.labels : []);
        const sourceDatasets = Array.isArray(source.datasets) ? source.datasets : (source.data && Array.isArray(source.data.datasets) ? source.data.datasets : []);
        
        const labels = sourceLabels.slice(0, 36).map((value) => String(value).slice(0, 60));
        const parseNumber = (value) => {
            if (value == null || value === '') return null;
            if (typeof value === 'number') return Number.isFinite(value) ? value : null;
            let text = String(value).trim().replace(/[\s%$€£]/g, '');
            const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
            if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
            else if (comma >= 0) text = text.length - comma - 1 <= 2 ? text.replace(',', '.') : text.replace(/,/g, '');
            const number = Number(text); return Number.isFinite(number) ? number : null;
        };
        const datasets = sourceDatasets.slice(0, 8).map((dataset, index) => ({
            label: String(dataset?.label || `Serie ${index + 1}`).slice(0, 80),
            type: allowed.has(dataset?.type) ? dataset.type : undefined,
            ...(Array.isArray(dataset?.borderDash) ? { borderDash: dataset.borderDash.slice(0, 4).map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 20) } : {}),
            data: Array.isArray(dataset?.data) ? dataset.data.slice(0, labels.length || 36).map(parseNumber) : [],
        })).filter((dataset) => dataset.data.filter(value => value != null).length >= 2);
        const explicitView = views.has(source.view) ? source.view : null;
        const inferredView = labels.length > 12 ? 'line'
            : labels.some(label => label.length > 14) ? 'horizontalBar'
            : datasets.length > 1 ? 'line'
            : (allowed.has(source.type) ? source.type : 'bar');
        return {
            type: allowed.has(source.type) ? source.type : 'bar', title: String(source.title || 'Visualización de datos').slice(0, 140),
            view: explicitView || inferredView,
            subtitle: String(source.subtitle || '').slice(0, 280), insight: String(source.insight || '').slice(0, 360), unit: String(source.unit || '').slice(0, 40), source: String(source.source || '').slice(0, 180),
            indexAxis: source.indexAxis === 'y' ? 'y' : 'x', stacked: Boolean(source.stacked), beginAtZero: Boolean(source.beginAtZero), labels, datasets,
        };
    }

    function createAdvancedChart(rawSpec) {
        const spec = normalizeChartSpec(rawSpec);
        const card = document.createElement('section'); card.className = 'vai-chart-card';
        card.dataset.chartSpec = JSON.stringify(spec);
        const viewOptions = [
            ['bar', 'Columnas'], ['horizontalBar', 'Barras horizontales'], ['stackedBar', 'Columnas apiladas'],
            ['line', 'Línea'], ['area', 'Área'], ['mixed', 'Combinada'], ['doughnut', 'Dona'],
            ['pie', 'Pastel'], ['radar', 'Radar'], ['polarArea', 'Área polar'],
        ].map(([value, label]) => `<option value="${value}"${spec.view === value ? ' selected' : ''}>${label}</option>`).join('');
        card.innerHTML = `<header class="vai-chart-head"><div><h3>${escapeHtml(spec.title)}</h3>${spec.subtitle ? `<p>${escapeHtml(spec.subtitle)}</p>` : ''}</div><div class="vai-chart-tools"><label class="vai-chart-view"><i class="fas fa-chart-simple"></i><span>Visualización</span><select data-chart-view aria-label="Tipo de visualización">${viewOptions}</select></label><button type="button" data-chart-download title="Descargar PNG" aria-label="Descargar gráfica como PNG"><i class="fas fa-image"></i></button><button type="button" data-chart-full title="Pantalla completa" aria-label="Ver gráfica en pantalla completa"><i class="fas fa-expand"></i></button></div></header>${spec.insight ? `<div class="vai-chart-insight"><i class="fas fa-lightbulb"></i><div><small>Lectura ejecutiva</small><strong>${escapeHtml(spec.insight)}</strong></div></div>` : ''}<div class="vai-chart-canvas"><canvas></canvas></div><div class="vai-chart-kpis"></div><footer class="vai-chart-foot"><span><i class="fas fa-database"></i>${escapeHtml(spec.source || 'Datos proporcionados en la consulta')}</span><span>${escapeHtml(spec.unit ? `Unidad: ${spec.unit}` : '')}</span></footer>`;
        const canvas = card.querySelector('canvas');
        const kpis = card.querySelector('.vai-chart-kpis');
        spec.datasets.slice(0, 4).forEach((dataset) => {
            const numbers = dataset.data.filter(Number.isFinite); if (!numbers.length) return;
            const latest = numbers[numbers.length - 1]; const avg = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
            const delta = numbers.length > 1 ? latest - numbers[0] : null;
            const pct = numbers.length > 1 && numbers[0] !== 0 ? delta / Math.abs(numbers[0]) * 100 : null;
            const item = document.createElement('div'); item.innerHTML = `<small>${escapeHtml(dataset.label)}</small><strong>${escapeHtml(formatChartValue(latest, spec.unit))}</strong><small>Prom. ${escapeHtml(formatChartValue(avg, spec.unit))}${delta != null ? ` · Δ ${delta > 0 ? '+' : ''}${escapeHtml(formatChartValue(delta, spec.unit))}` : ''}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}</small>`; kpis.appendChild(item);
        });

        function specForView(view) {
            const current = { ...spec, datasets: spec.datasets.map((dataset, index) => ({ ...dataset })) };
            current.view = view;
            current.fillArea = view === 'area';
            current.indexAxis = view === 'horizontalBar' ? 'y' : 'x';
            current.stacked = view === 'stackedBar';
            current.type = ['horizontalBar', 'stackedBar', 'mixed'].includes(view) ? 'bar' : view === 'area' ? 'line' : view;
            current.datasets = current.datasets.map((dataset, index) => ({
                ...dataset,
                type: view === 'mixed' ? (index % 2 ? 'line' : 'bar') : undefined,
            }));
            return current;
        }

        async function draw(view) {
            try {
                await VDS.ensureChartJs();
                const previous = chartInstances.get(canvas); if (previous) previous.destroy();
                const current = specForView(view);
                const type = current.type;
                if (['doughnut', 'pie', 'radar', 'polarArea'].includes(type)) current.indexAxis = 'x';
                const chart = VDS.buildChart(canvas, current, {
                    interaction: { mode: 'index', intersect: false },
                    animation: { duration: 650, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: current.datasets.length > 1 || ['doughnut', 'radar'].includes(type), position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { family: 'Inter', size: 10 }, color: '#D7E2EE' } },
                        tooltip: { backgroundColor: '#0B1220', titleColor: '#F8FAFC', bodyColor: '#E2E8F0', borderColor: 'rgba(148,163,184,.55)', borderWidth: 1, titleFont: { family: 'Inter', weight: '700' }, bodyFont: { family: 'Inter' }, padding: 11, cornerRadius: 8, callbacks: { label: (ctx) => ` ${ctx.dataset.label || ''}: ${formatChartValue(ctx.raw, spec.unit)}` } },
                    },
                    scales: ['doughnut', 'pie', 'radar', 'polarArea'].includes(type) ? {} : {
                        x: { stacked: current.stacked, grid: { display: false }, ticks: { color: '#B8C7D8', font: { family: 'Inter', size: 10 } } },
                        y: { stacked: current.stacked, beginAtZero: current.beginAtZero, grid: { color: 'rgba(148,163,184,.22)' }, ticks: { color: '#B8C7D8', font: { family: 'Inter', size: 10 }, callback: (value) => formatChartAxisValue(value) } },
                    },
                });
                chartInstances.set(canvas, chart);
                const selector = card.querySelector('[data-chart-view]'); if (selector) selector.value = view;
            } catch {
                card.querySelector('.vai-chart-canvas').innerHTML = '<div class="vai-error">No fue posible cargar el motor de gráficas.</div>';
            }
        }
        card.querySelector('[data-chart-view]').addEventListener('change', (event) => {
            spec.view = event.target.value;
            const selected = specForView(spec.view);
            spec.type = selected.type;
            spec.indexAxis = selected.indexAxis;
            spec.stacked = selected.stacked;
            spec.fillArea = selected.fillArea;
            spec.datasets = selected.datasets;
            card.dataset.chartSpec = JSON.stringify(selected);
            card._vaiChartReady = draw(spec.view);
            if (card.classList.contains('vai-editor-chart')) card.dispatchEvent(new Event('input', { bubbles: true }));
        });
        card.querySelector('[data-chart-download]').addEventListener('click', () => {
            const link = document.createElement('a'); link.href = canvas.toDataURL('image/png', 1); link.download = sanitizeFilename(spec.title || 'grafica') + '.png'; link.click();
        });
        card.querySelector('[data-chart-full]').addEventListener('click', () => card.requestFullscreen?.());
        card._vaiChartReady = draw(spec.view);
        return card;
    }

    function formatChartValue(value, unit) {
        const number = Number(value); if (!Number.isFinite(number)) return '—';
        const formatted = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(number);
        return unit === '%' ? formatted + '%' : unit ? formatted + ' ' + unit : formatted;
    }

    function sanitizeFilename(value) {
        return String(value || 'reporte-orion').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'reporte-orion';
    }

    function appendMessage(message, options = {}) {
        ensureMessageIdentity(message);
        const row = document.createElement('article');
        row.className = 'vai-message ' + (message.role === 'user' ? 'user' : 'assistant');
        row.classList.toggle('is-thinking', Boolean(options.thinking));
        row.dataset.messageId = message.id;
        const avatar = document.createElement('div'); avatar.className = 'vai-avatar';
        if (message.role === 'user') avatar.innerHTML = '<i class="fas fa-user"></i>';
        else {
            avatar.classList.add('vai-assistant-face', 'vai-orion');
            avatar.innerHTML = assistantFaceMarkup();
            setFaceState(avatar, options.thinking ? 'thinking' : 'idle');
        }
        const bubble = document.createElement('div'); bubble.className = 'vai-bubble';
        if (options.thinking) bubble.innerHTML = '<span class="vai-thinking"><span class="vai-thinking-orbit" aria-hidden="true"><i></i><i></i><i></i></span><span class="vai-thinking-copy"><strong data-vai-thinking-title>Entendiendo tu pregunta</strong><small data-vai-thinking-detail>Identifico tema, país, periodo y objetivo.</small><span class="vai-thinking-tools" data-vai-thinking-tools hidden></span></span></span>';
        else renderRich(bubble, message.rich, message.text || '');
        decorateMessage(bubble, message, options);
        if (!options.thinking && Array.isArray(message.attachments) && message.attachments.length) {
            const files = document.createElement('div'); files.className = 'vai-message-files';
            message.attachments.forEach((file) => {
                const chip = document.createElement('span');
                const lowerName = String(file.name || '').toLowerCase();
                const icon = String(file.type).startsWith('image/') ? 'fa-image'
                    : file.type === 'application/pdf' ? 'fa-file-pdf'
                    : lowerName.endsWith('.xlsx') ? 'fa-file-excel'
                    : (file.type === 'text/csv' || /\.(?:csv|tsv)$/i.test(lowerName)) ? 'fa-table'
                    : (file.type === 'application/json' || lowerName.endsWith('.json')) ? 'fa-file-code'
                    : 'fa-file-lines';
                chip.innerHTML = `<i class="fas ${icon}"></i>${escapeHtml(file.name)}`;
                files.appendChild(chip);
            });
            bubble.appendChild(files);
        }
        if (!options.thinking && message.role !== 'user' && message.text) {
            attachContentCopyActions(bubble);
            attachReportActions(bubble, message);
            if (shouldShowAssistantControls(message)) {
                attachFollowUpActions(bubble, message);
                enhanceAssistantResponse(bubble, message);
            }
            if (message.pdfPreview?.downloadUrl) presentPdfDocument(message, bubble, message.pdfPreview);
        }
        if (!options.thinking && message.role === 'user' && message.text) attachUserMessageActions(bubble, message);
        row.append(avatar, bubble); els.messages.appendChild(row);
        return { row, bubble, avatar };
    }

    function attachContentCopyActions(bubble) {
        if (!bubble) return;
        bubble.querySelectorAll('.vai-code-copy').forEach((btn) => {
            if (btn.dataset.boundCopy) return;
            btn.dataset.boundCopy = '1';
            btn.addEventListener('click', async () => {
                const codeText = btn.closest('.vai-code-block')?.querySelector('pre code')?.textContent || '';
                if (!codeText) return;
                try {
                    await navigator.clipboard.writeText(codeText);
                    btn.innerHTML = '<i class="fas fa-check"></i><span>Copiado</span>';
                    setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i><span>Copiar código</span>'; }, 1600);
                } catch { window.prompt('Copia el código:', codeText); }
            });
        });
        bubble.querySelectorAll('.vai-table-copy').forEach((btn) => {
            if (btn.dataset.boundCopy) return;
            btn.dataset.boundCopy = '1';
            btn.addEventListener('click', async () => {
                const table = btn.closest('.vai-table-box')?.querySelector('table');
                if (!table) return;
                const tsv = Array.from(table.querySelectorAll('tr'))
                    .map(tr => Array.from(tr.children).map(cell => cell.textContent.replace(/\s+/g, ' ').trim()).join('\t'))
                    .join('\n');
                try {
                    await navigator.clipboard.writeText(tsv);
                    btn.innerHTML = '<i class="fas fa-check"></i><span>Copiada</span>';
                    setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i><span>Copiar tabla</span>'; }, 1600);
                } catch { window.prompt('Copia la tabla:', tsv); }
            });
        });
    }

    function decorateMessage(bubble, message, options = {}) {
        bubble.querySelector(':scope > .vai-selected-model')?.remove();
        if (bubble.querySelector(':scope > .vai-message-meta')) return;
        const meta = document.createElement('div'); meta.className = 'vai-message-meta';
        const label = message.role === 'user' ? 'Tú' : 'ORION';
        const time = new Date(message.ts || Date.now()).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const modelNames = { nebula: 'Nebula', cirius: 'Cirius', pulsar: 'Pulsar' };
        const modelLabel = message.role === 'model' && modelNames[message.modelProfile]
            ? `<span class="vai-model-pill${message.modelFallback ? ' is-fallback' : ''}" title="${message.modelFallback ? 'Se utilizó respaldo automático para completar dentro del plazo' : 'Modelo activo en este turno'}">${escapeHtml(modelNames[message.modelProfile])}${message.modelFallback ? ' · respaldo' : ''}</span>`
            : '';
        const words = message.role === 'model' ? String(message.text || '').trim().split(/\s+/).filter(Boolean).length : 0;
        const readBadge = words >= 120 ? `<span class="vai-read-time"><i class="far fa-clock"></i>${Math.max(1, Math.ceil(words / 190))} min</span>` : '';
        const citations = Array.isArray(message.citations) ? message.citations : (Array.isArray(message.rich?.meta?.citations) ? message.rich.meta.citations : []);
        const evidenceCount = new Set(citations.map(item => {
            try { return new URL(item.url).hostname.replace(/^www\./, ''); }
            catch { return item.source || item.title; }
        }).filter(Boolean)).size;
        const evidence = message.role !== 'user' && evidenceCount > 0
            ? `<span class="vai-evidence-chip" title="${escapeHtml(citations.slice(0, 3).map(item => item.source || item.title || '').filter(Boolean).join(' · ') || 'Evidencia consultada')}"><i class="fas fa-shield-halved"></i>${evidenceCount} ${evidenceCount === 1 ? 'fuente' : 'fuentes'}</span>`
            : '';
        const edited = message.role === 'user' && message.editedAt ? ' <em>editado</em>' : '';
        meta.innerHTML = `<span class="vai-meta-sender"><i class="fas ${message.role === 'user' ? 'fa-user' : 'fa-wand-magic-sparkles'}"></i>${label}${modelLabel}</span><span class="vai-meta-right">${readBadge}<small>${options.thinking ? 'Preparando análisis' : time}${edited}</small>${evidence}</span>`;
        bubble.prepend(meta);
    }

    function formatChartAxisValue(value) {
        const number = Number(value); if (!Number.isFinite(number)) return '—';
        return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2, notation: Math.abs(number) >= 10000 ? 'compact' : 'standard' }).format(number);
    }

    function attachUserMessageActions(bubble, message) {
        if (bubble.querySelector('.vai-user-message-actions')) return;
        const actions = document.createElement('div');
        actions.className = 'vai-user-message-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'vai-edit-message';
        edit.setAttribute('aria-label', 'Editar esta consulta y volver a generar la respuesta');
        edit.title = 'Editar y regenerar desde aquí';
        edit.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i><span>Editar</span>';
        edit.addEventListener('click', () => openMessageEditor(bubble, message));
        actions.appendChild(edit);
        bubble.appendChild(actions);
    }

    function openMessageEditor(bubble, message) {
        if (busy || bubble.querySelector('.vai-edit-query')) return;
        const editor = document.createElement('form');
        editor.className = 'vai-edit-query';
        editor.setAttribute('aria-label', 'Editar consulta');
        const label = document.createElement('label');
        label.textContent = 'Reformula tu consulta';
        const textarea = document.createElement('textarea');
        textarea.value = String(message.text || '');
        textarea.rows = 3;
        textarea.maxLength = 12000;
        textarea.setAttribute('aria-label', 'Texto de la consulta');
        const hasUnavailableFiles = Array.isArray(message.attachments)
            && message.attachments.some(file => !file?.id);
        const helper = document.createElement('small');
        helper.innerHTML = hasUnavailableFiles
            ? '<i class="fas fa-circle-info"></i> Se regenerará el hilo desde aquí. Para releer archivos antiguos, vuelve a adjuntarlos.'
            : '<i class="fas fa-rotate"></i> Se reemplazarán esta respuesta y las posteriores por una nueva versión.';
        const buttons = document.createElement('div');
        buttons.className = 'vai-edit-query-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'vai-edit-cancel';
        cancel.textContent = 'Cancelar';
        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'vai-edit-submit';
        submit.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Actualizar y regenerar';
        buttons.append(cancel, submit);
        editor.append(label, textarea, helper, buttons);

        const original = Array.from(bubble.children).filter(child => child !== editor);
        original.forEach(child => { child.hidden = true; });
        bubble.appendChild(editor);
        const resize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 84), 260) + 'px';
        };
        resize();
        textarea.addEventListener('input', resize);
        const close = () => {
            editor.remove();
            original.forEach(child => { child.hidden = false; });
        };
        cancel.addEventListener('click', close);
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault(); editor.requestSubmit();
            }
        });
        editor.addEventListener('submit', async (event) => {
            event.preventDefault();
            const revised = textarea.value.trim();
            if (!revised) { textarea.focus(); return; }
            submit.disabled = true; cancel.disabled = true; textarea.disabled = true;
            await regenerateFromMessage(message, revised);
        });
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    async function regenerateFromMessage(message, revisedText) {
        if (busy) return;
        const conversation = activeConversation();
        if (!conversation) return;
        const index = conversation.messages.findIndex(item => item === message || (item.id && item.id === message.id));
        if (index < 0) return;
        const editedMessage = ensureMessageIdentity({
            ...message,
            role: 'user',
            text: revisedText,
            ts: Date.now(),
            editedAt: Date.now(),
            revision: Number(message.revision || 0) + 1,
        });
        conversation.messages = conversation.messages.slice(0, index);
        renderConversation();
        await sendMessage(revisedText, { userMessage: editedMessage });
    }

    async function regenerateAssistantMessage(assistantMessage) {
        if (busy) return;
        const conversation = activeConversation();
        if (!conversation) return;
        const index = conversation.messages.findIndex(item => item === assistantMessage || (item.id && item.id === assistantMessage.id));
        if (index < 0) return;
        let userIndex = index - 1;
        while (userIndex >= 0 && conversation.messages[userIndex]?.role !== 'user') userIndex -= 1;
        if (userIndex < 0) return;
        const sourceUser = conversation.messages[userIndex];
        const replayUser = ensureMessageIdentity({
            ...sourceUser,
            role: 'user',
            ts: Date.now(),
            revision: Number(sourceUser.revision || 0) + 1,
        });
        conversation.messages = conversation.messages.slice(0, userIndex);
        renderConversation();
        await sendMessage(replayUser.text, { userMessage: replayUser });
    }

    async function handleFeedback(queryId, type, button, prefilledCorrection = null) {
        if (!queryId) return;
        let payload = { queryId };
        if (type === 'up') payload.rating = 5;
        else if (type === 'down') payload.rating = 1;
        else if (type === 'correct') {
            const correction = prefilledCorrection || window.prompt('¿En qué se equivocó la IA? Esta corrección se memorizará para futuras preguntas.');
            if (!correction) return;
            payload.correctionText = correction;
        }
        
        if (button) button.disabled = true;
        try {
            const response = await fetch('/api/ai-feedback', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                if (button) {
                    const group = button.closest('.vai-feedback-group');
                    if (group) group.innerHTML = '<span class="vai-feedback-thanks"><i class="fas fa-check"></i> Gracias por tu feedback.</span>';
                }
            }
        } catch {
            if (button) button.disabled = false;
        }
    }

    function shouldShowAssistantControls(message = {}) {
        const strategy = String(message.retrievalStrategy || message.rich?.meta?.retrievalStrategy || '');
        // Los saludos, despedidas y respuestas cortas no necesitan parecer un
        // informe con barras de acciones. Reservamos la interfaz analítica
        // para respuestas que realmente tienen información para profundizar.
        if (/^(?:local_conversation|live_fx_reference|fast_start|vall-domain-guard)/.test(strategy)) return false;
        if (message.rich?.meta?.followUps?.length && /^(forecast|news|comparison|price|coverage|inventory|decision|analysis)$/.test(message.rich?.meta?.answerStrategy?.intent || '')) return true;
        const words = String(message.text || '').trim().split(/\s+/).filter(Boolean).length;
        const blocks = Array.isArray(message.rich?.blocks) ? message.rich.blocks : [];
        return words >= 45 || blocks.some(block => ['chart', 'table', 'document', 'diagram'].includes(block?.type));
    }

    function followUpSuggestions(message = {}) {
        const allowedIcons = new Set(['fa-magnifying-glass-plus', 'fa-triangle-exclamation', 'fa-link', 'fa-sliders', 'fa-chart-line', 'fa-diagram-project', 'fa-eye']);
        const items = message.rich?.meta?.followUps;
        const supplied = Array.isArray(items) ? items.filter(item => typeof item?.label === 'string'
            && typeof item?.prompt === 'string' && item.label.trim() && item.prompt.trim()).slice(0, 3).map(item => ({
                label: item.label.trim().slice(0, 50), prompt: item.prompt.trim().slice(0, 600),
                icon: allowedIcons.has(item.icon) ? item.icon : 'fa-link',
            })) : [];
        return supplied.length ? supplied : [
            { icon: 'fa-magnifying-glass-plus', label: 'Profundizar', prompt: 'Profundiza la respuesta anterior, explica el mecanismo y agrega la información material que falte.' },
            { icon: 'fa-triangle-exclamation', label: 'Riesgos', prompt: 'Resume los principales riesgos de la respuesta anterior y qué indicador debería vigilar.' },
            { icon: 'fa-link', label: 'Fuentes y fechas', prompt: 'Muéstrame las fuentes, fechas de corte y limitaciones de la respuesta anterior.' },
        ];
    }

    function attachFollowUpActions(bubble, message = {}) {
        if (!shouldShowAssistantControls(message)) return;
        if (bubble.querySelector('.vai-followups')) return;
        const suggestions = followUpSuggestions(message);
        const row = document.createElement('div'); row.className = 'vai-followups';
        const label = document.createElement('small'); label.textContent = 'Continuar este hilo'; row.appendChild(label);
        suggestions.forEach(({ icon, label: title, prompt }) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'vai-followup-action';
            const mark = document.createElement('i'); mark.className = `fas ${icon}`; mark.setAttribute('aria-hidden', 'true');
            button.append(mark, document.createTextNode(title));
            button.addEventListener('click', () => sendMessage(prompt));
            row.appendChild(button);
        });
        bubble.appendChild(row);
    }

    function responsePresentation(message) {
        if (message.rich?.meta?.forecastAnalysis) return message.rich.meta.forecastAnalysis.available
            ? { icon: 'fa-chart-line', label: 'Pronóstico evaluado con histórico' }
            : { icon: 'fa-sliders', label: 'Escenarios y límites del pronóstico' };
        const blocks = Array.isArray(message.rich?.blocks) ? message.rich.blocks : [];
        const types = new Set(blocks.map(block => String(block?.type || '')));
        if (types.has('chart')) return { icon: 'fa-chart-line', label: 'Análisis con gráfica' };
        if (types.has('table') || /\|\s*[-:]{2,}/.test(String(message.text || ''))) return { icon: 'fa-table', label: 'Análisis comparativo' };
        if (types.has('document') || /\b(?:informe|reporte ejecutivo)\b/i.test(String(message.text || ''))) return { icon: 'fa-file-lines', label: 'Informe' };
        if (Array.isArray(message.citations) && message.citations.length) return { icon: 'fa-shield-halved', label: 'Respuesta con fuentes' };
        return { icon: 'fa-sparkles', label: 'Respuesta analítica' };
    }

    function safeSourceUrl(value) {
        try {
            const url = new URL(String(value || ''), window.location.origin);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch { return ''; }
    }

    function buildSourcesPanel(message) {
        const citations = Array.isArray(message.citations) ? message.citations
            : (Array.isArray(message.rich?.meta?.citations) ? message.rich.meta.citations : []);
        if (!citations.length) return null;
        const panel = document.createElement('details');
        panel.className = 'vai-answer-sources';
        const summary = document.createElement('summary');
        summary.innerHTML = `<span><i class="fas fa-shield-halved"></i> Fuentes consultadas</span><b>${citations.length}</b><i class="fas fa-chevron-down"></i>`;
        const list = document.createElement('ol');
        const coverage = message.rich?.meta?.evidenceCoverage;
        if (coverage && Number.isInteger(coverage.total) && coverage.total > 0) {
            const covWrap = document.createElement('div');
            covWrap.className = 'vai-evidence-coverage-box';
            const chips = document.createElement('div');
            chips.className = 'vai-coverage-chips';
            const period = coverage.period;
            const addChip = (icon, label, val, tone = '') => {
                const chip = document.createElement('span');
                chip.className = `vai-cov-chip${tone ? ` is-${tone}` : ''}`;
                chip.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i> ${escapeHtml(label)}: <strong>${escapeHtml(val)}</strong>`;
                chips.appendChild(chip);
            };
            if (period) addChip('fa-calendar-range', 'Periodo', `${String(period.start).slice(0, 10)} → ${String(period.end).slice(0, 10)}`);
            addChip('fa-calendar-check', 'Fechas confirmadas', `${Number(coverage.dated) || 0}/${coverage.total}`, (Number(coverage.dated) || 0) > 0 ? 'ok' : '');
            if (period) addChip('fa-bullseye', 'En rango / Antecedentes', `${Number(coverage.inPeriod) || 0} / ${Number(coverage.outsidePeriod) || 0}`);
            if (coverage.undated) addChip('fa-clock', 'Sin fecha', String(Number(coverage.undated)), 'warn');
            covWrap.appendChild(chips);
            const note = document.createElement('p');
            note.className = 'vai-evidence-coverage';
            const summaryParts = [];
            if (period) {
                summaryParts.push(`Periodo revisado: ${String(period.start).slice(0, 10)} → ${String(period.end).slice(0, 10)} (${Number(coverage.inPeriod) || 0} dentro del periodo; ${Number(coverage.outsidePeriod) || 0} antecedentes)`);
            }
            if (Number(coverage.undated) > 0) {
                summaryParts.push(`${Number(coverage.undated)} sin fecha`);
            }
            note.textContent = summaryParts.length
                ? `${summaryParts.join(' · ')}. ${coverage.notice || 'Cobertura informativa: los enlaces muestran las fuentes consultadas y sus cortes de fecha.'}`
                : (coverage.notice || 'Cobertura informativa: los enlaces muestran las fuentes consultadas y sus cortes de fecha.');
            covWrap.appendChild(note);
            panel.appendChild(covWrap);
        }
        citations.forEach((citation, index) => {
            const item = document.createElement('li');
            const copy = document.createElement('span');
            const title = String(citation?.title || citation?.source || `Fuente ${index + 1}`);
            const date = citation?.date || citation?.updatedAt;
            const detail = [citation?.source && citation.source !== title ? citation.source : '', date ? `Fecha: ${date}` : citation?.indexedAt ? `Indexado: ${citation.indexedAt} (publicación sin confirmar)` : '',
                citation?.unit || '', citation?.access === 'headline_or_summary' ? 'Titular o resumen público' : citation?.access === 'public_summary' ? 'Sólo resumen público' : ''].filter(Boolean).join(' · ');
            copy.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}`;
            const href = safeSourceUrl(citation?.url || citation?.link || citation?.href);
            if (href) {
                const link = document.createElement('a');
                link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                link.setAttribute('aria-label', `Abrir fuente: ${title}`);
                link.innerHTML = '<i class="fas fa-arrow-up-right-from-square"></i>';
                item.append(copy, link);
            } else item.appendChild(copy);
            list.appendChild(item);
        });
        panel.prepend(summary);
        panel.appendChild(list);
        return panel;
    }

    function buildDecisionPanel(message) {
        const brief=message.rich?.meta?.decisionBrief;
        if(!brief || typeof brief.effect!=='string' || typeof brief.verification!=='string') return null;
        const panel=document.createElement('details');panel.className='vai-decision-brief';
        const summary=document.createElement('summary');
        summary.innerHTML='<span><i class="fas fa-compass" aria-hidden="true"></i> Para tu decisión</span><i class="fas fa-chevron-down" aria-hidden="true"></i>';
        const list=document.createElement('dl');
        const row=(title,copy)=>{const label=document.createElement('dt');label.textContent=title;const value=document.createElement('dd');value.textContent=String(copy || '').slice(0,1800);list.append(label,value);return value;};
        const facts=Array.isArray(brief.facts)?brief.facts.slice(0,3):[];
        const changes=row('Qué cambió',facts.length?'':brief.uncertainty);
        for(const fact of facts) {
            const item=document.createElement('p');item.textContent=[String(fact.text || '').slice(0,500),String(fact.date || '').slice(0,25)].filter(Boolean).join(' · ');
            const url=safeSourceUrl(fact.url);
            if(url) {const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=' Ver fuente';item.appendChild(link);}
            changes.appendChild(item);
        }
        row('Cómo puede afectarte',brief.effect);
        row('Antes de decidir',brief.verification);
        panel.append(summary,list);return panel;
    }

    function enhanceAssistantResponse(bubble, message) {
        if (!shouldShowAssistantControls(message)) return;
        if (!bubble || bubble.querySelector(':scope > .vai-answer-content')) return;
        const excluded = '.vai-message-meta,.vai-followups,.vai-response-actions,.vai-message-files';
        const contentNodes = Array.from(bubble.children).filter(node => !node.matches(excluded));
        if (!contentNodes.length) return;
        const content = document.createElement('div');
        content.className = 'vai-answer-content';
        contentNodes.forEach(node => content.appendChild(node));

        const metaObj = message.rich?.meta || {};
        const validations = [];
        const citationsArr = Array.isArray(message.citations) ? message.citations : (Array.isArray(metaObj.citations) ? metaObj.citations : []);
        if (metaObj.statisticalModel?.available) validations.push({ tone: 'ok', icon: 'fa-square-poll-vertical', text: 'Regresión OLS verificada' });
        if (metaObj.forecastAnalysis?.available) validations.push({ tone: 'ok', icon: 'fa-chart-line', text: 'Pronóstico con backtesting' });
        if (metaObj.evidenceCoverage?.dated > 0) validations.push({ tone: 'ok', icon: 'fa-calendar-check', text: `${metaObj.evidenceCoverage.dated} ${metaObj.evidenceCoverage.dated === 1 ? 'fuente fechada' : 'fuentes fechadas'}` });
        else if (citationsArr.length > 0) validations.push({ tone: 'ok', icon: 'fa-shield-halved', text: `${citationsArr.length} ${citationsArr.length === 1 ? 'referencia trazable' : 'referencias trazables'}` });
        if (Array.isArray(metaObj.warnings) && metaObj.warnings.length) {
            validations.push({ tone: 'warn', icon: 'fa-triangle-exclamation', text: metaObj.warnings[0] });
        }
        let stripAnchor = null;
        if (validations.length) {
            const strip = document.createElement('div');
            strip.className = 'vai-validation-strip';
            strip.setAttribute('aria-label', 'Validaciones de evidencia y datos');
            strip.innerHTML = validations
                .map(v => `<span class="vai-val-pill is-${v.tone}"><i class="fas ${v.icon}" aria-hidden="true"></i>${escapeHtml(v.text)}</span>`)
                .join('');
            content.prepend(strip);
            stripAnchor = strip;
        }

        const lead = Array.from(content.querySelectorAll('p')).find(node => !node.closest('.vai-rich-summary') && node.textContent.trim().length > 35);
        if (lead && !content.querySelector('.vai-rich-summary')) lead.classList.add('vai-answer-lead');

        const headings = Array.from(content.querySelectorAll('h2,h3')).filter(heading => heading.textContent.trim());
        if (headings.length >= 2) {
            const nav = document.createElement('nav');
            nav.className = 'vai-answer-map';
            nav.setAttribute('aria-label', 'Secciones de la respuesta');
            const label = document.createElement('span');
            label.textContent = 'En esta respuesta';
            nav.appendChild(label);
            headings.slice(0, 6).forEach((heading, index) => {
                heading.id = `vai-section-${message.id}-${index}`;
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = heading.textContent.trim();
                button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                nav.appendChild(button);
            });
            if (stripAnchor) stripAnchor.after(nav);
            else content.prepend(nav);
        }

        const meta = bubble.querySelector(':scope > .vai-message-meta');
        if (meta) meta.after(content); else bubble.prepend(content);
        const decision=buildDecisionPanel(message);
        if(decision) {
            const followups=bubble.querySelector(':scope > .vai-followups');
            if(followups) bubble.insertBefore(decision,followups);else bubble.appendChild(decision);
        }
        const sources = buildSourcesPanel(message);
        if (sources) {
            const followups = bubble.querySelector(':scope > .vai-followups');
            if (followups) bubble.insertBefore(sources, followups); else bubble.appendChild(sources);
        }
    }

    function attachReportActions(bubble, message) {
        if (!message?.text) return;
        if (bubble.querySelector('.vai-response-actions')) return;
        const includeExports = shouldShowAssistantControls(message);
        const actions = document.createElement('div'); actions.className = 'vai-response-actions';
        let html = '<span class="vai-actions-label">Acciones</span><button type="button" class="vai-action-pill" data-copy-answer title="Copiar respuesta" aria-label="Copiar respuesta"><i class="far fa-copy"></i><span>Copiar</span></button><button type="button" class="vai-action-pill" data-regenerate-answer title="Regenerar esta respuesta" aria-label="Regenerar esta respuesta"><i class="fas fa-rotate-right"></i><span>Regenerar</span></button>';
        if (includeExports) {
            html += '<button type="button" data-edit-report title="Abrir en Editor de reportes" aria-label="Crear reporte a partir de esta respuesta"><i class="fas fa-file-pen"></i><span>Crear reporte</span></button><button type="button" data-quick-pdf title="Preparar PDF descargable" aria-label="Preparar PDF descargable"><i class="fas fa-file-pdf"></i><span>PDF</span></button><button type="button" data-quick-word title="Exportar a Word" aria-label="Exportar respuesta a Word"><i class="fas fa-file-word"></i><span>Word</span></button>';
        }
        html += `<span class="vai-feedback-group" style="margin-left:auto; display:flex; gap:0.25rem;">
            <button type="button" data-speak title="Leer en voz alta" aria-label="Leer en voz alta"><i class="fas fa-volume-up"></i></button>
            ${message.queryId ? '<button type="button" data-feedback="up" title="Útil" aria-label="Marcar respuesta útil"><i class="fas fa-thumbs-up"></i></button><button type="button" data-feedback="down" title="No útil" aria-label="Marcar respuesta mejorable"><i class="fas fa-thumbs-down"></i></button><button type="button" data-feedback="correct" title="Enseñar/Corregir" aria-label="Corregir respuesta" class="vai-btn-correct"><i class="fas fa-pen-to-square"></i><span>Corregir</span></button>' : ''}
        </span>`;

        actions.innerHTML = html;
        actions.querySelector('[data-copy-answer]')?.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            try {
                await navigator.clipboard.writeText(String(message.text || ''));
                button.innerHTML = '<i class="fas fa-check"></i><span>Copiado</span>';
                setTimeout(() => { button.innerHTML = '<i class="far fa-copy"></i><span>Copiar</span>'; }, 1600);
            } catch {
                window.prompt('Copia la respuesta:', String(message.text || ''));
            }
        });
        actions.querySelector('[data-regenerate-answer]')?.addEventListener('click', () => {
            if (!busy) void regenerateAssistantMessage(message);
        });
        actions.querySelector('[data-edit-report]')?.addEventListener('click', () => openReportStudio(message));
        actions.querySelector('[data-quick-pdf]')?.addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            try {
                btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Preparando PDF</span>';
                const result = await resolveMessagePdf(message, bubble);
                markPdfReady(btn, result);
                presentPdfDocument(message, bubble, result);
                triggerExportDownload(result);
            } catch (error) {
                btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i><span>Reintentar PDF</span>';
                btn.title = error.message || 'No se pudo preparar el PDF. Intenta de nuevo.';
            } finally { btn.disabled = false; }
        });
        actions.querySelector('[data-quick-word]')?.addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                const report = reportContextFor(message);
                await requestServerExport(report.title, report.content, 'docx', bubble);
            } finally { btn.disabled = false; }
        });

        const speakBtn = actions.querySelector('[data-speak]');
        speakBtn?.addEventListener('click', () => {
            const replyFace = bubble.closest('.vai-message')?.querySelector('.vai-assistant-face');
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                speakBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                setFaceState(replyFace, 'idle');
                setConversationFaceState('idle');
            } else {
                const utterance = new SpeechSynthesisUtterance(message.text.replace(/[#*`_]/g, ''));
                utterance.lang = 'es-MX';
                utterance.rate = .97;
                utterance.pitch = 1.02;
                const spanishVoices = window.speechSynthesis.getVoices().filter(voice => /^es(?:-|_)/i.test(voice.lang));
                utterance.voice = spanishVoices.find(voice => /natural|online|google|microsoft/i.test(voice.name)) || spanishVoices[0] || null;
                utterance.onstart = () => {
                    setFaceState(replyFace, 'speaking');
                    setConversationFaceState('speaking');
                    setFaceExpression(replyFace, expressionForText(message.text));
                    setFaceExpression(els.conversationFace, expressionForText(message.text));
                };
                utterance.onboundary = (event) => {
                    cueFaceBoundary(replyFace, message.text, event);
                    cueFaceBoundary(els.conversationFace, message.text, event);
                };
                utterance.onend = () => {
                    speakBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                    setFaceState(replyFace, 'idle');
                    setConversationFaceState('idle');
                    if (continuousVoiceMode && autoListenCallback) setTimeout(autoListenCallback, 200);
                };
                utterance.onerror = () => {
                    speakBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                    setFaceState(replyFace, 'idle');
                    setConversationFaceState('idle');
                };
                speakBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                window.speechSynthesis.speak(utterance);
            }
        });

        if (message.queryId) {
            actions.querySelectorAll('[data-feedback]').forEach(btn => {
                btn.addEventListener('click', (e) => handleFeedback(message.queryId, e.currentTarget.dataset.feedback, e.currentTarget));
            });
        }

        bubble.appendChild(actions);
    }

    function wantsPdfExport(value, history = []) {
        const text = String(value || '');
        const explicitPdf = /\b(?:pdf|archivo\s+(?:en\s+)?pdf|documento\s+(?:en\s+)?pdf|exporta(?:r)?\s+(?:a\s+)?pdf|descarga(?:r)?\s+(?:en\s+)?pdf)\b/i.test(text);
        if (explicitPdf) return true;
        // «Dame ese informe con gráficas» conserva el formato PDF cuando el
        // hilo lo solicitó antes; no debe convertirse en otra respuesta plana.
        const asksExistingVisualReport = /\b(?:ese|este|mismo|anterior|el)\s+(?:informe|reporte|documento)\b/i.test(text)
            && /\b(?:gr[aá]ficas?|tablas?|visualizaci[oó]n|figuras?)\b/i.test(text);
        if (!asksExistingVisualReport) return false;
        return Array.isArray(history) && history.slice(-16).some(turn =>
            (turn?.role === 'user') && /\b(?:pdf|archivo\s+(?:en\s+)?pdf|documento\s+(?:en\s+)?pdf)\b/i.test(String(turn?.text || turn?.content || ''))
        );
    }

    function markPdfReady(button, result) {
        if (!button || !result?.downloadUrl) return;
        button.dataset.downloadUrl = result.downloadUrl;
        button.dataset.filename = result.filename || 'reporte-orion.pdf';
        button.innerHTML = '<i class="fas fa-file-circle-check"></i><span>PDF listo</span>';
        button.title = `Descargar ${button.dataset.filename}`;
        button.setAttribute('aria-label', button.title);
        button.classList.add('is-export-ready');
        const actions = button.closest('.vai-response-actions');
        const bubble = actions?.parentElement;
        if (!bubble || bubble.querySelector('.vai-pdf-download')) return;
        const offer = document.createElement('a');
        offer.className = 'vai-pdf-download';
        offer.href = result.downloadUrl;
        offer.download = button.dataset.filename;
        offer.addEventListener('click', event => { event.preventDefault(); button.click(); });
        offer.innerHTML = `<i class="fas fa-file-pdf" aria-hidden="true"></i><span><strong>Informe PDF listo</strong><small>${escapeHtml(button.dataset.filename)}</small></span><i class="fas fa-arrow-down" aria-hidden="true"></i>`;
        bubble.insertBefore(offer, actions);
    }

    function previewUrl(downloadUrl) {
        const divider = String(downloadUrl || '').includes('?') ? '&' : '?';
        // Los parámetros del fragmento son una sugerencia al visor PDF del navegador:
        // abre la primera página ajustada al ancho y evita, cuando el visor lo soporta,
        // iniciar con el panel de miniaturas abierto.
        return `${downloadUrl}${divider}preview=1#page=1&zoom=page-width&view=FitH&navpanes=0`;
    }

    function savePdfPreview(message, result) {
        message.pdfPreview = result;
        const conversation = conversations.find(item => item.messages?.some(entry => entry === message || entry.id === message.id));
        if (!conversation) return;
        const stored = conversation.messages.find(entry => entry === message || entry.id === message.id);
        stored.pdfPreview = result;
        // Una recuperación que termina después de cambiar de chat no debe
        // cambiar el chat activo ni guardar el enlace en otra respuesta.
        conversation.updatedAt = Date.now();
        try { saveConversations(); }
        catch (error) { console.warn('No se pudo actualizar el enlace PDF en el historial local:', error.message); }
        saveConversationToProfile(conversation);
        renderHistory();
    }

    function resolveMessagePdf(message, bubble) {
        const language=window.VNReportArtifacts.selectedLanguage(),current=pendingPdfFiles.get(message);
        if (current?.language===language) return current.promise;
        const report = message.pdfPreview?.recipe || reportContextFor(message);
        const pending = window.VNReportArtifacts.ensure({ artifact: message.pdfPreview,language,
            rebuild: async () => ({ ...await createServerExport(report.title, report.content, 'pdf', bubble),
                title: report.title, ...(message.pdfPreview?.recipe ? { recipe: message.pdfPreview.recipe } : {}) }),
        }).then(result => { if(window.VNReportArtifacts.selectedLanguage()!==language) throw new Error('El idioma cambió durante la generación. Vuelve a generar el PDF.');if (result !== message.pdfPreview) savePdfPreview(message, result); return result; })
            .finally(() => {if(pendingPdfFiles.get(message)?.promise===pending) pendingPdfFiles.delete(message);});
        pendingPdfFiles.set(message, {language,promise:pending});
        return pending;
    }

    function presentPdfDocument(message, bubble, result) {
        if (!bubble || !result?.downloadUrl || bubble.querySelector('.vai-pdf-preview')) return;
        const content = bubble.querySelector(':scope > .vai-answer-content');
        if (!content) return;
        const title = String(message?.pdfPreview?.title || result.filename || 'Informe ORION').replace(/\.pdf$/i, '');
        const summary = String(message?.rich?.summary || 'El informe está listo para revisión. Incluye el análisis, tablas y gráficas disponibles.').replace(/\s+/g, ' ').trim().slice(0, 420);
        const originalNodes = Array.from(content.children);
        const artifact = document.createElement('section');
        artifact.className = 'vai-pdf-preview';
        artifact.innerHTML = `<header><span><i class="fas fa-file-pdf" aria-hidden="true"></i> Informe ORION</span><div class="vai-pdf-preview-actions"><button type="button" data-pdf-expand aria-label="Abrir vista amplia del PDF" aria-pressed="false" title="Vista amplia"><i class="fas fa-expand" aria-hidden="true"></i><span>Vista amplia</span></button><a href="${escapeHtml(result.downloadUrl)}" download="${escapeHtml(result.filename || 'reporte-orion.pdf')}"><i class="fas fa-download" aria-hidden="true"></i> Descargar PDF</a></div></header><div class="vai-pdf-preview-title"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(summary)}</p><p data-pdf-status role="status">Abriendo PDF guardado…</p><button type="button" data-pdf-retry hidden>Reintentar PDF</button></div><iframe title="Vista previa de ${escapeHtml(title)}" hidden></iframe>`;
        const frame = artifact.querySelector('iframe');
        frame.style.display = 'none';
        const status = artifact.querySelector('[data-pdf-status]');
        const retry = artifact.querySelector('[data-pdf-retry]');
        const download = artifact.querySelector('a[download]');
        const showPdfError = error => { status.hidden = false; status.textContent = error.message || 'No se pudo abrir el PDF guardado.'; retry.hidden = false; };
        const openPdf = async () => {
            retry.hidden = true; status.hidden = false; status.textContent = 'Abriendo PDF guardado…';
            try {
                const saved = await resolveMessagePdf(message, bubble);
                if (!artifact.isConnected) return;
                download.href = saved.downloadUrl; download.download = saved.filename;
                markPdfReady(bubble.querySelector('[data-quick-pdf]'), saved);
                frame.src = previewUrl(saved.downloadUrl); frame.hidden = false; frame.style.removeProperty('display'); status.hidden = true;
            } catch (error) { showPdfError(error); }
        };
        retry.addEventListener('click', openPdf);
        download.addEventListener('click', async event => {
            event.preventDefault();
            try { triggerExportDownload(await resolveMessagePdf(message, bubble)); }
            catch (error) { showPdfError(error); }
        });
        const expandButton = artifact.querySelector('[data-pdf-expand]');
        const updateExpandedControl = () => {
            const expanded = document.fullscreenElement === artifact || artifact.classList.contains('is-pdf-focus');
            if (!expandButton) return;
            expandButton.setAttribute('aria-pressed', String(expanded));
            expandButton.setAttribute('aria-label', expanded ? 'Cerrar vista amplia del PDF' : 'Abrir vista amplia del PDF');
            expandButton.title = expanded ? 'Cerrar vista amplia' : 'Vista amplia';
            expandButton.innerHTML = `<i class="fas fa-${expanded ? 'compress' : 'expand'}" aria-hidden="true"></i><span>${expanded ? 'Cerrar vista' : 'Vista amplia'}</span>`;
        };
        escucharGlobal(document, 'fullscreenchange', updateExpandedControl);
        expandButton?.addEventListener('click', async () => {
            try {
                if (document.fullscreenElement === artifact) await document.exitFullscreen();
                else if (artifact.classList.contains('is-pdf-focus')) artifact.classList.remove('is-pdf-focus');
                else if (artifact.requestFullscreen) await artifact.requestFullscreen();
                else artifact.classList.toggle('is-pdf-focus');
            } catch (_) {
                artifact.classList.toggle('is-pdf-focus');
            }
            updateExpandedControl();
        });
        const details = document.createElement('details');
        details.className = 'vai-pdf-source';
        details.innerHTML = '<summary>Ver contenido completo del informe</summary>';
        const source = document.createElement('div'); source.className = 'vai-pdf-source-content';
        originalNodes.forEach(node => source.appendChild(node));
        details.appendChild(source);
        content.replaceChildren(artifact, details);
        content.classList.add('is-pdf-document');
        bubble.querySelector('.vai-pdf-download')?.remove();
        openPdf();
    }

    async function prepareRequestedPdf(message, bubble) {
        const button = bubble?.querySelector('[data-quick-pdf]');
        if (!button || button.dataset.preparing || button.dataset.downloadUrl) return;
        button.dataset.preparing = 'true'; button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Preparando PDF</span>';
        try {
            const result = await resolveMessagePdf(message, bubble);
            markPdfReady(button, result);
            presentPdfDocument(message, bubble, message.pdfPreview);
        } catch (error) {
            button.innerHTML = '<i class="fas fa-file-pdf"></i><span>PDF</span>';
            button.title = error.message || 'Preparar PDF descargable';
        } finally {
            delete button.dataset.preparing;
            button.disabled = false;
        }
    }

    function scrollMessageToStart(row, behavior = 'auto') {
        if (!row || !els.messages) return;
        const viewport = els.messages.getBoundingClientRect();
        const message = row.getBoundingClientRect();
        const top = els.messages.scrollTop + message.top - viewport.top - 14;
        els.messages.scrollTo({ top: Math.max(0, top), behavior });
    }

    function renderConversation() {
        els.messages.replaceChildren();
        const conversation = activeConversation();
        const messages = conversation?.messages?.filter((message) => !message._hidden) || [];
        if (!messages.length) {
            els.messages.appendChild(els.welcome);
            els.welcome.hidden = false;
        } else {
            els.welcome.hidden = true;
            let lastQuestion = '', upgraded = false, latestAssistantRow = null;
            messages.forEach((message) => {
                if (message.role === 'user') lastQuestion = message.text || '';
                else if (lastQuestion) {
                    if (sanitizeLegacyChartMessage(message, lastQuestion)) upgraded = true;
                    const before = message.text;
                    const enriched = guaranteeRequestedChart({ text: message.text || '', rich: message.rich || null }, lastQuestion);
                    message.text = enriched.text; message.rich = enriched.rich;
                    if (message.text !== before) upgraded = true;
                }
                const rendered = appendMessage(message);
                if (message.role !== 'user') latestAssistantRow = rendered.row;
            });
            if (upgraded && conversation) persistConversation(conversation);
            requestAnimationFrame(() => {
                if (latestAssistantRow) scrollMessageToStart(latestAssistantRow);
                else els.messages.scrollTop = els.messages.scrollHeight;
                updateScrollBottomButton();
            });
        }
        // La respuesta más reciente abre por su inicio. Así una respuesta larga
        // nunca aparece cortada por la mitad ni obliga a buscar dónde comenzó.
        if (!messages.length) requestAnimationFrame(() => { els.messages.scrollTop = 0; updateScrollBottomButton(); });
        syncExportChatAvailability();
    }

    function setBusy(value) {
        busy = value; els.send.disabled = value; els.input.disabled = value; els.attach.disabled = value; els.stop.hidden = !value;
        const modelSelect = $('vaiModelSelect');
        if (modelSelect) modelSelect.disabled = value;
        const modelTrigger = $('vaiModelTrigger');
        if (modelTrigger) modelTrigger.disabled = value;
        els.messages?.querySelectorAll('.vai-followup-action, [data-regenerate-answer], .vai-inline-retry').forEach(button => { button.disabled = value; });
        syncExportChatAvailability();
        setConversationFaceState(value ? 'thinking' : (els.input.value.trim() ? 'listening' : 'idle'));
    }

    function requiresStatisticalModel(message) {
        return /\b(?:regre[sc]i[oó]n(?:es)?|modelo\s+lineal|m[ií]nimos\s+cuadrados|\bols\b|an[aá]lisis\s+estad[ií]stic[oa]|estad[ií]stic[oa]\s+(?:del|de la|de los)|tendencia\s+lineal)\b/i.test(String(message || ''));
    }

    function historyExcerpt(value, limit = 3200) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (text.length <= limit) return text;
        const head = Math.ceil(limit * .62);
        return `${text.slice(0, head).trim()} … ${text.slice(-(limit - head)).trim()}`;
    }

    function looksLikeFollowUp(value) {
        return /(?:^(?:y|pero|ahora|entonces|tambi[eé]n|adem[aá]s|contin[uú]a|sigue)\b|\b(?:eso|esa|ese|esto|anterior|lo mismo|hazlo|hazla|comp[aá]ralo|comp[aá]rala|profundiza|ampl[ií]a|detalla|res[uú]melo|gr[aá]fica|tabla|informe|reporte|fuentes?)\b)/i.test(String(value || '').trim());
    }

    function threadDataQuestion(messages, current) {
        if (!looksLikeFollowUp(current)) return current;
        const previousUsers = messages.slice(0, -1).filter(item => item.role === 'user');
        for (let index = previousUsers.length - 1; index >= 0; index--) {
            const candidate = String(previousUsers[index].text || '').trim();
            if (candidate && !looksLikeFollowUp(candidate)) return `${candidate}\nSeguimiento: ${current}`;
        }
        return current;
    }

    async function statisticalFallback(message) {
        const response = await fetch('/api/statistical-analysis', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }), signal: controller?.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.response?.blocks?.length) {
            throw new Error(data.error || 'No se recibió el cálculo estadístico verificable.');
        }
        return { text: data.text || data.response.markdown || '', rich: data.response };
    }

    function hasCalculatedStatisticalModel(result) {
        return result?.rich?.meta?.statisticalModel?.available === true;
    }

    function mergeCalculatedStatisticalModel(result, calculation) {
        if (!calculation?.rich?.blocks?.length) return result;
        // Si el modelo principal sí entregó una respuesta narrativa, mantenemos
        // esa explicación y anteponemos solamente el cálculo reproducible.
        // No se reemplaza el análisis contextual cuando el cálculo local no es
        // posible (p. ej., una cotización física regional sin serie normalizada).
        if (!result?.rich?.blocks?.length) return { ...result, ...calculation };
        const currentCitations = Array.isArray(result.rich.meta?.citations) ? result.rich.meta.citations : [];
        const calculationCitations = Array.isArray(calculation.rich.meta?.citations) ? calculation.rich.meta.citations : [];
        const citations = [...calculationCitations, ...currentCitations].filter((item, index, all) =>
            all.findIndex(candidate => (candidate?.id || candidate?.url || candidate?.title) === (item?.id || item?.url || item?.title)) === index,
        );
        return {
            ...result,
            text: [calculation.text, result.text].filter(Boolean).join('\n\n'),
            rich: {
                ...result.rich,
                blocks: [...calculation.rich.blocks, ...result.rich.blocks],
                markdown: [calculation.rich.markdown, result.rich.markdown].filter(Boolean).join('\n\n'),
                meta: { ...result.rich.meta, ...calculation.rich.meta, citations },
            },
        };
    }

    async function streamAnswer(message, history, attachmentIds, onText, apiContext = '', historicalChart = null, onStatus = null, modelProfile = 'cirius') {
        controller = new AbortController();
        const historicalContext = historicalChart
            ? `\n[SERIE HISTÓRICA VERIFICADA PARA LA GRÁFICA]\n${JSON.stringify(historicalChart)}\nUsa exactamente estos datos para generar el bloque chart solicitado.\n[FIN SERIE HISTÓRICA]`
            : '';
        const payload = {
            message,
            prompt: message,
            conversationId: activeId,
            conversationMemory: [...(activeConversation()?.messages || [])].reverse().find(item=>item.role === 'model' && Object.prototype.hasOwnProperty.call(item.rich?.meta || {}, 'conversationMemory'))?.rich.meta.conversationMemory || null,
            history,
            attachmentIds,
            context: ['Página dedicada ORION de VALLNews.', apiContext, historicalContext].filter(Boolean).join('\n\n'),
            mode: 'auto',
            modelProfile,
            structured: true,
        };
        const response = await fetch('/api/ai-insight-stream', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (response.status === 401) {
            try { sessionStorage.removeItem('vn_auth'); sessionStorage.removeItem('vn_user'); } catch {}
            window.location.replace('/');
            throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
        }
        if (!response.ok || !response.body) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `No fue posible consultar ORION (${response.status}).`);
        }
        const reader = response.body.getReader(); const decoder = new TextDecoder();
        let buffer = '', full = '', rich = null, route = null;
        const processEvents = (flushRemaining = false) => {
            buffer = buffer.replace(/\r\n/g, '\n');
            let split;
            while ((split = buffer.indexOf('\n\n')) >= 0) {
                const event = buffer.slice(0, split); buffer = buffer.slice(split + 2);
                const payloadText = event.split('\n').filter((item) => item.startsWith('data:')).map((item) => item.slice(5).trim()).join('\n');
                if (!payloadText) continue;
                let data; try { data = JSON.parse(payloadText); } catch { continue; }
                if (data.status) onStatus?.(data.status, {
                    detail: data.detail || '',
                    tools: Array.isArray(data.tools) ? data.tools : [],
                    completedTools: Array.isArray(data.completedTools) ? data.completedTools : [],
                });
                if (data.error) {
                    if (full) {
                        console.warn('ORION: cierre de streaming con texto recibido.', data.error);
                        return { doneEarly: true };
                    }
                    throw new Error(data.error);
                }
                if (data.text) { full += data.text; onText(full); }
                if (data.response) rich = data.response;
                if (data.done) {
                    if (data.finalText) full = data.finalText;
                    route = {
                        tier: data.tier, mode: data.mode, model: data.model, queryId: data.queryId,
                        modelProfile: data.modelProfile, modelFallback: !!data.modelFallback,
                        evidenceCount: data.evidenceCount, citations: data.citations, retrievalStrategy: data.retrievalStrategy,
                    };
                }
            }
            if (flushRemaining && buffer.trim()) {
                buffer += '\n\n';
                return processEvents(false);
            }
            return null;
        };
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                buffer += decoder.decode();
                processEvents(true);
                break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });
            const early = processEvents(false);
            if (early?.doneEarly) return { text: full, rich, route };
        }
        if (!full && rich?.markdown) full = rich.markdown;
        if (!full) throw new Error('ORION no devolvió contenido. Intenta formular la pregunta nuevamente.');
        return { text: full, rich, route };
    }

    function guaranteeRequestedChart(result, question, preferredSpec = null) {
        if (result.rich?.meta?.chartStatus) return result;
        if (!/\b(gr[aá]fica|gr[aá]fico|graficar|chart|visualiza)/i.test(question)) return result;
        const hasRichChart = Array.isArray(result.rich?.blocks) && result.rich.blocks.some((block) => block.type === 'chart');
        const hasChartFence = /```chart\s*\n/i.test(result.text || '');
        if (hasRichChart || hasChartFence || typeof VDS === 'undefined') return result;
        const spec = preferredSpec;
        if (!spec) return result;
        result.text = String(result.text || '').trim() + `\n\n## Gráfica interactiva\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``;
        if (result.rich && Array.isArray(result.rich.blocks)) result.rich.blocks.push({ type: 'chart', spec });
        return result;
    }

    function sanitizeLegacyChartMessage(message, question) {
        if (!message || message.role !== 'model' || message.rich?.meta?.chartStatus) return false;
        if (!/\b(gr[aá]fica|gr[aá]fico|graficar|chart|visualiza)/i.test(String(question || ''))) return false;
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

    const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    function normalizedFileType(file) {
        const extension = String(file?.name || '').split('.').pop().toLowerCase();
        const raw = String(file?.type || '').toLowerCase().split(';')[0].trim();
        if (extension === 'csv' || extension === 'tsv') return 'text/csv';
        if (extension === 'xlsx') return XLSX_MIME;
        if (extension === 'md' || extension === 'markdown') return 'text/markdown';
        if (extension === 'json') return 'application/json';
        if (extension === 'txt') return 'text/plain';
        if (extension === 'pdf') return 'application/pdf';
        if (raw && raw !== 'application/vnd.ms-excel' && raw !== 'text/tab-separated-values') return raw;
        return '';
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
            reader.readAsDataURL(file);
        });
    }

    function splitDelimitedLine(line, delimiter = ',') {
        const cells = [];
        let current = '';
        let inQuotes = false;
        const raw = String(line || '');
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            if (inQuotes) {
                if (ch === '"' && raw[i + 1] === '"') { current += '"'; i += 1; }
                else if (ch === '"') inQuotes = false;
                else current += ch;
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === delimiter) {
                cells.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        cells.push(current.trim());
        return cells;
    }

    function detectCsvDelimiter(sampleText, isTsv = false) {
        if (isTsv) return '\t';
        const firstLine = String(sampleText || '').split(/\r?\n/).find((line) => line.trim()) || '';
        const countChar = (target) => {
            let count = 0; let quoted = false;
            for (const ch of firstLine) {
                if (ch === '"') quoted = !quoted;
                else if (!quoted && ch === target) count += 1;
            }
            return count;
        };
        const tabs = countChar('\t');
        const semis = countChar(';');
        const commas = countChar(',');
        if (tabs > commas && tabs > semis) return '\t';
        if (semis > commas) return ';';
        return ',';
    }

    function parseAttachmentNumber(raw) {
        const str = String(raw ?? '').trim();
        if (!str || /^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str)) return null;
        const isPercent = str.includes('%');
        let clean = str.replace(/[%\s$€£]/g, '').replace(/\b(?:mxn|usd|eur|brl|cad)\b/gi, '').trim();
        if (!clean || !/^[+-]?[\d.,]+$/.test(clean)) return null;
        const comma = clean.lastIndexOf(','), dot = clean.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) clean = comma > dot ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
        else if (comma >= 0) clean = clean.length - comma - 1 <= 2 ? clean.replace(',', '.') : clean.replace(/,/g, '');
        const num = Number(clean);
        return Number.isFinite(num) ? { value: num, isPercent } : null;
    }

    function uniformSampleIndices(length, maxPoints = 36) {
        if (length <= maxPoints) return Array.from({ length }, (_, idx) => idx);
        const step = (length - 1) / (maxPoints - 1);
        return Array.from({ length: maxPoints }, (_, idx) => Math.round(idx * step));
    }

    function formatStatNumber(value) {
        if (!Number.isFinite(value)) return '—';
        return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value);
    }

    function analyzeTabularStats(headers, parsedRows) {
        const sampleRows = (Array.isArray(parsedRows) ? parsedRows : []).slice(0, 300);
        if (!headers?.length || sampleRows.length < 2) return [];
        const colCount = Math.min(headers.length, 12);
        const colAnalysis = Array.from({ length: colCount }, (_, colIndex) => {
            let nonEmpty = 0;
            const parsedEntries = [];
            sampleRows.forEach((row, rowIdx) => {
                const rawCell = row[colIndex];
                if (rawCell == null || String(rawCell).trim() === '') return;
                nonEmpty += 1;
                const parsed = parseAttachmentNumber(rawCell);
                if (parsed) parsedEntries.push({ rowIdx, ...parsed });
            });
            const isNumeric = parsedEntries.length >= 2 && nonEmpty > 0 && (parsedEntries.length / nonEmpty) >= 0.6;
            return { colIndex, name: String(headers[colIndex] || `Columna ${colIndex + 1}`).trim(), parsedEntries, isNumeric };
        });

        const labelCol = colAnalysis.find((c) => !c.isNumeric)?.colIndex ?? -1;
        return colAnalysis.filter((col) => col.isNumeric && col.colIndex !== labelCol).slice(0, 5).map((col) => {
            const nums = col.parsedEntries.map((entry) => entry.value);
            const sum = nums.reduce((acc, n) => acc + n, 0);
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            const avg = sum / nums.length;
            const sampled = uniformSampleIndices(col.parsedEntries.length, 36);
            const labels = sampled.map((idx) => {
                const entry = col.parsedEntries[idx];
                const rawLabel = labelCol >= 0 ? String(sampleRows[entry.rowIdx]?.[labelCol] || '').trim() : '';
                return (rawLabel || `Fila ${entry.rowIdx + 1}`).slice(0, 40);
            });
            const values = sampled.map((idx) => col.parsedEntries[idx].value);
            const pctCount = col.parsedEntries.filter((e) => e.isPercent).length;
            return {
                colIndex: col.colIndex,
                name: col.name,
                count: col.parsedEntries.length,
                min,
                max,
                avg,
                unit: pctCount > col.parsedEntries.length / 2 ? '%' : '',
                labels,
                values,
            };
        });
    }

    function parseDelimitedPreview(text, isTsv = false) {
        const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (!lines.length) return { kind: 'text', summary: 'Archivo vacío', excerpt: '' };
        const delimiter = detectCsvDelimiter(lines[0], isTsv);
        const parsedHeaders = splitDelimitedLine(lines[0], delimiter);
        const maxCols = 8;
        const headers = parsedHeaders.slice(0, maxCols);
        const hiddenCols = Math.max(0, parsedHeaders.length - maxCols);
        const allParsedRows = lines.slice(1, 301).map((line) => splitDelimitedLine(line, delimiter));
        const rows = allParsedRows.slice(0, 5).map((row) => row.slice(0, maxCols));
        const totalDataRows = Math.max(0, lines.length - 1);
        const numericColumns = analyzeTabularStats(parsedHeaders, allParsedRows);
        return {
            kind: 'table',
            headers,
            rows,
            hiddenCols,
            totalRows: totalDataRows,
            totalCols: parsedHeaders.length,
            numericColumns,
            summary: `${parsedHeaders.length} cols · ${totalDataRows} filas`,
            copyText: lines.slice(0, 12).join('\n'),
        };
    }

    function parseJsonPreview(text) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                const count = parsed.length;
                if (count && parsed[0] && typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
                    const fullKeys = Object.keys(parsed[0]);
                    const allKeys = fullKeys.slice(0, 8);
                    const cellStr = (row, k) => {
                        const val = row?.[k];
                        return val == null ? '—' : typeof val === 'object' ? JSON.stringify(val) : String(val);
                    };
                    const fullRows = parsed.slice(0, 300).map((row) => fullKeys.slice(0, 12).map((k) => cellStr(row, k)));
                    const rows = parsed.slice(0, 5).map((row) => allKeys.map((k) => cellStr(row, k)));
                    const numericColumns = analyzeTabularStats(fullKeys.slice(0, 12), fullRows);
                    return {
                        kind: 'table',
                        headers: allKeys,
                        rows,
                        hiddenCols: Math.max(0, fullKeys.length - 8),
                        totalRows: count,
                        totalCols: fullKeys.length,
                        numericColumns,
                        summary: `JSON · ${count} registros`,
                        copyText: JSON.stringify(parsed.slice(0, 10), null, 2),
                    };
                }
                return {
                    kind: 'text',
                    summary: `JSON · Lista (${count} elementos)`,
                    excerpt: JSON.stringify(parsed.slice(0, 8), null, 2).slice(0, 800),
                };
            }
            if (parsed && typeof parsed === 'object') {
                const keys = Object.keys(parsed);
                return {
                    kind: 'text',
                    summary: `JSON · ${keys.length} claves`,
                    excerpt: JSON.stringify(parsed, null, 2).slice(0, 800),
                };
            }
        } catch { /* texto plano si excedió slice o JSON parcial */ }
        return {
            kind: 'text',
            summary: 'JSON · Vista previa parcial',
            excerpt: String(text || '').slice(0, 600),
        };
    }

    async function inspectPendingFile(entry) {
        const name = String(entry?.file?.name || '').toLowerCase();
        if (entry.type.startsWith('image/') || entry.type.startsWith('audio/')) return;
        if (entry.type === 'application/pdf') {
            entry.preview = { kind: 'pdf', summary: 'PDF listo para lectura multimodal' };
            if (pendingFiles.includes(entry)) renderPendingFiles();
            if (typeof window.VNInspectPdf === 'function') {
                try {
                    const pdfMeta = await window.VNInspectPdf(entry.file);
                    if (!pendingFiles.includes(entry)) return;
                    const pages = Number(pdfMeta?.pages || 0);
                    const excerpt = String(pdfMeta?.excerpt || '').trim();
                    if (pages > 0 || excerpt) {
                        const pageLabel = pages ? `${pages} ${pages === 1 ? 'página' : 'páginas'}` : 'PDF';
                        entry.preview = {
                            kind: 'pdf',
                            pages,
                            excerpt,
                            summary: excerpt ? `${pageLabel} · texto extraído` : `${pageLabel} · lectura multimodal/imagen`,
                        };
                        renderPendingFiles();
                    }
                } catch { /* conserva estado base si el PDF no puede previsualizarse en cliente */ }
            }
            return;
        }
        if (entry.type === XLSX_MIME || name.endsWith('.xlsx')) {
            entry.preview = { kind: 'xlsx', summary: 'Excel (.xlsx) → CSV automático al enviar' };
            if (pendingFiles.includes(entry)) renderPendingFiles();
            return;
        }
        try {
            const sample = await entry.file.slice(0, 262144).text();
            if (!pendingFiles.includes(entry)) return;
            if (entry.type === 'text/csv' || name.endsWith('.csv') || name.endsWith('.tsv')) {
                entry.preview = parseDelimitedPreview(sample, name.endsWith('.tsv'));
            } else if (entry.type === 'application/json' || name.endsWith('.json')) {
                entry.preview = parseJsonPreview(sample);
            } else {
                const lineCount = sample ? sample.split(/\r?\n/).length : 0;
                entry.preview = {
                    kind: 'text',
                    summary: `${lineCount} líneas`,
                    excerpt: sample.slice(0, 750),
                };
            }
            renderPendingFiles();
        } catch { /* sin vista previa local */ }
    }

    function plotPendingAttachmentChart(entry, preferredColIndex = null) {
        const cols = Array.isArray(entry?.preview?.numericColumns) ? entry.preview.numericColumns : [];
        if (!cols.length || busy) return;
        const selected = cols.find((c) => c.colIndex === preferredColIndex) || cols[0];
        const minTxt = formatStatNumber(selected.min);
        const maxTxt = formatStatNumber(selected.max);
        const avgTxt = formatStatNumber(selected.avg);
        const spec = {
            type: selected.labels.length > 10 ? 'line' : 'bar',
            title: `${selected.name} — ${entry.file.name}`,
            unit: selected.unit || '',
            subtitle: `${entry.file.name} · mín ${minTxt} · máx ${maxTxt} · prom ${avgTxt} (${selected.count} filas)`,
            insight: `Rango observado entre ${minTxt} y ${maxTxt} con promedio de ${avgTxt} sobre ${selected.count} datos válidos de "${entry.file.name}".`,
            source: `Archivo adjunto: ${entry.file.name}`,
            labels: selected.labels,
            datasets: [{ label: selected.name, data: selected.values }],
        };
        const statsRows = cols.map((col) => [
            col.name,
            String(col.count),
            `${formatStatNumber(col.min)}${col.unit}`,
            `${formatStatNumber(col.max)}${col.unit}`,
            `${formatStatNumber(col.avg)}${col.unit}`,
        ]);
        const statsMd = [
            '| Columna | Registros | Mínimo | Máximo | Promedio |',
            '| :--- | ---: | ---: | ---: | ---: |',
            ...statsRows.map((r) => `| ${r.join(' | ')} |`),
        ].join('\n');
        const headingText = `Resumen numérico y gráfica local · ${entry.file.name}`;
        const modelText = `### ${headingText}\n\n${statsMd}\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``;
        const rich = {
            version: '1.0',
            mode: 'quick',
            taskType: 'local_attachment_chart',
            markdown: modelText,
            blocks: [
                { type: 'heading', level: 3, content: headingText },
                { type: 'table', headers: ['Columna', 'Registros', 'Mínimo', 'Máximo', 'Promedio'], rows: statsRows },
                { type: 'chart', spec },
            ],
            meta: { modelUsed: 'Análisis local CSV/JSON', chartStatus: 'served' },
        };
        const conversation = ensureConversation();
        els.welcome.hidden = true;
        if (els.welcome.parentNode === els.messages) els.welcome.remove();
        const userMsg = ensureMessageIdentity({ role: 'user', text: `Graficar "${selected.name}" del archivo ${entry.file.name}`, ts: Date.now() });
        const modelMsg = ensureMessageIdentity({ role: 'model', text: modelText, rich, modelProfile: 'local-csv', ts: Date.now() });
        conversation.messages.push(userMsg, modelMsg);
        appendMessage(userMsg);
        const rendered = appendMessage(modelMsg);
        persistConversation(conversation);
        syncExportChatAvailability();
        requestAnimationFrame(() => scrollMessageToStart(rendered.row, 'smooth'));
    }

    function buildAttachmentPreviewNode(preview) {
        const box = document.createElement('div');
        box.className = 'vai-attachment-preview';
        if (preview.kind === 'table' && Array.isArray(preview.headers) && preview.headers.length) {
            const wrap = document.createElement('div');
            wrap.className = 'vai-attachment-table-wrap';
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            preview.headers.forEach((h) => {
                const th = document.createElement('th');
                th.textContent = h || 'col';
                headRow.appendChild(th);
            });
            thead.appendChild(headRow);
            const tbody = document.createElement('tbody');
            (preview.rows || []).forEach((row) => {
                const tr = document.createElement('tr');
                preview.headers.forEach((_, colIdx) => {
                    const td = document.createElement('td');
                    td.textContent = row[colIdx] != null && row[colIdx] !== '' ? row[colIdx] : '—';
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.append(thead, tbody);
            wrap.appendChild(table);
            box.appendChild(wrap);
            if (preview.hiddenCols > 0 || preview.totalRows > (preview.rows?.length || 0)) {
                const foot = document.createElement('div');
                foot.className = 'vai-attachment-preview-foot';
                foot.textContent = `Mostrando ${preview.rows?.length || 0} de ${preview.totalRows} filas${preview.hiddenCols > 0 ? ` (+${preview.hiddenCols} columnas)` : ''}.`;
                box.appendChild(foot);
            }
            return box;
        }
        if (preview.excerpt) {
            const pre = document.createElement('pre');
            pre.className = 'vai-attachment-excerpt';
            pre.textContent = preview.excerpt;
            box.appendChild(pre);
        }
        return box;
    }

    function renderPendingFiles() {
        els.attachments.replaceChildren();
        els.attachments.hidden = !pendingFiles.length;
        pendingFiles.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'vai-attachment-card' + (item.previewOpen ? ' has-preview' : '');
            const header = document.createElement('div');
            header.className = 'vai-attachment-head';
            if (item.type.startsWith('image/')) {
                const image = document.createElement('img'); image.src = item.url; image.alt = ''; header.appendChild(image);
            } else {
                const lowerName = String(item.file.name || '').toLowerCase();
                const iconClass = item.type === 'application/pdf' ? 'fa-file-pdf'
                    : (item.type === XLSX_MIME || lowerName.endsWith('.xlsx')) ? 'fa-file-excel'
                    : (item.type === 'text/csv' || /\.(?:csv|tsv)$/i.test(lowerName)) ? 'fa-table'
                    : (item.type === 'application/json' || lowerName.endsWith('.json')) ? 'fa-file-code'
                    : 'fa-file-lines';
                const icon = document.createElement('i'); icon.className = `fas ${iconClass}`; header.appendChild(icon);
            }
            const copy = document.createElement('span');
            copy.className = 'vai-attachment-info';
            const sizeLabel = `${(item.file.size / 1024).toFixed(item.file.size > 1024 * 1024 ? 0 : 1)} KB`;
            const metaLine = item.preview?.summary ? `${sizeLabel} · ${item.preview.summary}` : sizeLabel;
            copy.innerHTML = `<strong>${escapeHtml(item.file.name)}</strong><small>${escapeHtml(metaLine)}</small>`;
            header.appendChild(copy);

            const controls = document.createElement('div');
            controls.className = 'vai-attachment-tools';
            const hasExpandable = Boolean(item.preview && ((item.preview.kind === 'table' && item.preview.headers?.length) || item.preview.excerpt));
            if (hasExpandable) {
                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'vai-att-btn';
                toggleBtn.textContent = item.previewOpen ? 'Ocultar' : 'Vista previa';
                toggleBtn.addEventListener('click', () => {
                    item.previewOpen = !item.previewOpen;
                    renderPendingFiles();
                });
                controls.appendChild(toggleBtn);
            }
            if (item.preview?.copyText) {
                const copyRowsBtn = document.createElement('button');
                copyRowsBtn.type = 'button';
                copyRowsBtn.className = 'vai-att-btn';
                copyRowsBtn.textContent = 'Copiar muestra';
                copyRowsBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(item.preview.copyText);
                        copyRowsBtn.textContent = 'Copiado ✓';
                        setTimeout(() => { copyRowsBtn.textContent = 'Copiar muestra'; }, 1600);
                    } catch {}
                });
                controls.appendChild(copyRowsBtn);
            }
            const numericCols = Array.isArray(item.preview?.numericColumns) ? item.preview.numericColumns : [];
            if (numericCols.length) {
                let colSelect = null;
                if (numericCols.length > 1) {
                    colSelect = document.createElement('select');
                    colSelect.className = 'vai-att-col-select';
                    colSelect.setAttribute('aria-label', 'Columna numérica a graficar');
                    numericCols.forEach((col) => {
                        const opt = document.createElement('option');
                        opt.value = String(col.colIndex);
                        opt.textContent = col.name;
                        colSelect.appendChild(opt);
                    });
                    controls.appendChild(colSelect);
                }
                const plotBtn = document.createElement('button');
                plotBtn.type = 'button';
                plotBtn.className = 'vai-att-btn is-chart';
                plotBtn.innerHTML = '<i class="fas fa-chart-column" aria-hidden="true"></i> Graficar';
                plotBtn.addEventListener('click', () => {
                    const targetCol = colSelect ? Number(colSelect.value) : numericCols[0].colIndex;
                    plotPendingAttachmentChart(item, targetCol);
                });
                controls.appendChild(plotBtn);
            }
            if (!item.type.startsWith('audio/')) {
                const askBtn = document.createElement('button');
                askBtn.type = 'button';
                askBtn.className = 'vai-att-btn is-accent';
                askBtn.textContent = 'Analizar';
                askBtn.addEventListener('click', () => {
                    const promptHint = item.preview?.summary
                        ? `Analiza "${item.file.name}" (${item.preview.summary}), resume los indicadores principales, detecta valores atípicos y genera una tabla o gráfica comparativa.`
                        : `Analiza "${item.file.name}" y extrae los hallazgos y métricas clave.`;
                    if (!els.input.value.trim()) {
                        els.input.value = promptHint;
                        resizeInput();
                        refreshComposerFace();
                    }
                    els.input.focus();
                    els.input.setSelectionRange(els.input.value.length, els.input.value.length);
                });
                controls.appendChild(askBtn);
            }
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'vai-att-remove';
            remove.setAttribute('aria-label', `Quitar ${item.file.name}`);
            remove.innerHTML = '<i class="fas fa-xmark"></i>';
            remove.addEventListener('click', () => { URL.revokeObjectURL(item.url); pendingFiles.splice(index, 1); renderPendingFiles(); });
            controls.appendChild(remove);
            header.appendChild(controls);
            card.appendChild(header);
            if (numericCols.length) {
                const statsBar = document.createElement('div');
                statsBar.className = 'vai-attachment-stats';
                numericCols.slice(0, 3).forEach((col) => {
                    const pill = document.createElement('span');
                    pill.className = 'vai-stat-chip';
                    pill.textContent = `${col.name}: mín ${formatStatNumber(col.min)}${col.unit} · máx ${formatStatNumber(col.max)}${col.unit} · prom ${formatStatNumber(col.avg)}${col.unit}`;
                    statsBar.appendChild(pill);
                });
                card.appendChild(statsBar);
            }
            if (item.previewOpen && hasExpandable) {
                card.appendChild(buildAttachmentPreviewNode(item.preview));
            }
            els.attachments.appendChild(card);
        });
    }

    function addFiles(fileList) {
        const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/json', XLSX_MIME, 'audio/webm', 'audio/mp4', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/webm;codecs=opus']);
        const incoming = Array.from(fileList || []);
        for (const file of incoming) {
            const type = normalizedFileType(file);
            if (!allowed.has(type)) { window.alert(`${file.name}: tipo de archivo no compatible.`); continue; }
            if (file.size > 6 * 1024 * 1024) { window.alert(`${file.name}: el límite es 6 MB por archivo.`); continue; }
            if (pendingFiles.length >= 5) { window.alert('Puedes adjuntar hasta 5 archivos por mensaje.'); break; }
            const entry = { file, type, url: URL.createObjectURL(file), preview: null, previewOpen: false };
            pendingFiles.push(entry);
            void inspectPendingFile(entry);
        }
        renderPendingFiles();
    }

    async function uploadFiles(files, signal = null) {
        const uploaded = [];
        for (const item of files) {
            let dataUrl = await fileToDataUrl(item.file);
            if (dataUrl.startsWith('data:')) {
                dataUrl = dataUrl.replace(/^data:[^;,]*;base64,/i, `data:${item.type};base64,`);
            }
            const response = await fetch('/api/chat-attachments', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.file.name, type: item.type, dataUrl }),
                ...(signal ? { signal } : {}),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.attachment?.id) throw new Error(data.error || `No se pudo subir ${item.file.name}.`);
            uploaded.push(data.attachment);
        }
        return uploaded;
    }

    async function sendMessage(text, options = {}) {
        const suppliedMessage = options.userMessage && typeof options.userMessage === 'object' ? options.userMessage : null;
        const clean = String(text || '').trim() || (!suppliedMessage && pendingFiles.length ? (pendingFiles.some(f => String(f.type || '').startsWith('audio/')) ? 'Escucha este mensaje de voz y responde a mi consulta.' : 'Analiza los archivos adjuntos y presenta los hallazgos principales.') : '');
        // `busy` pertenece a la instancia actual del script. En una SPA una
        // instancia previa puede sobrevivir unos milisegundos al remontar la
        // página y recibir el mismo submit. El candado en el formulario es
        // compartido por ambas y bloquea la segunda consulta antes de tocar el
        // historial o abrir otra petición.
        if (!clean || busy || els.form?.dataset.orionSending === '1') return;
        if (els.form) els.form.dataset.orionSending = '1';
        
        const conversation = ensureConversation();
        const correctionKeywords = /te equivocaste|est(a|á) mal|est(a|á)s mal|no era lo que ped[ií]|eso no|no me refer[ií]a a|incorrecto|corr[ií]ge|corr[ií]gelo|as[ií] no|m[aá]l/i;
        if (correctionKeywords.test(clean)) {
            const previousAiMessage = conversation.messages.slice().reverse().find(m => m.role === 'model' && m.queryId);
            if (previousAiMessage) {
                // Auto-reportar que el usuario está corrigiendo el último mensaje
                handleFeedback(previousAiMessage.queryId, 'correct', null, clean);
            }
        }
        
        const fileSnapshot = suppliedMessage ? [] : pendingFiles.slice();
        const selectedModel = $('vaiModelSelect')?.value;
        const requestedModelProfile = ['nebula', 'cirius', 'pulsar'].includes(selectedModel) ? selectedModel : 'cirius';
        setBusy(true);
        let uploaded = suppliedMessage && Array.isArray(suppliedMessage.attachments) ? suppliedMessage.attachments : [];
        try {
            if (!suppliedMessage && fileSnapshot.length) {
                controller = new AbortController();
                uploaded = await uploadFiles(fileSnapshot, controller.signal);
                controller = null;
            }
        } catch (error) {
            controller = null;
            setBusy(false);
            if (els.form) delete els.form.dataset.orionSending;
            if (error?.name !== 'AbortError' && session.current) window.alert(error.message);
            if (continuousVoiceMode && els.voiceOverlay) {
                els.voiceOverlay.hidden = true;
                setFaceState(els.voiceOrb, 'idle');
                continuousVoiceMode = false;
            }
            return;
        }
        if (!session.current) return;
        if (!suppliedMessage) {
            fileSnapshot.forEach(item => URL.revokeObjectURL(item.url)); pendingFiles = []; renderPendingFiles();
        }
        
        els.welcome.hidden = true; if (els.welcome.parentNode === els.messages) els.welcome.remove();
        const userMessage = ensureMessageIdentity(suppliedMessage ? {
            ...suppliedMessage,
            text: clean,
            attachments: uploaded.map(({ id, name, type, size }) => ({ id, name, type, size })),
        } : {
            role: 'user', text: clean,
            attachments: uploaded.map(({ id, name, type, size }) => ({ id, name, type, size })),
            ts: Date.now(),
        });
        conversation.messages.push(userMessage); appendMessage(userMessage);
        const recent = conversation.messages.filter((item) => !item._hidden).slice(-25, -1).map((item) => ({
            role: item.role,
            content: historyExcerpt(item.text, item.role === 'user' ? 3400 : 3000),
        }));
        persistConversation(conversation); els.input.value = ''; resizeInput();
        const pending = appendMessage({ role: 'model', text: '' }, { thinking: true });
        setThinkingStage(pending, 'understand');
        // Aunque una fuente tarde, la persona debe ver que ORION avanza. Los
        // eventos SSE siguen teniendo prioridad, pero este recorrido evita la
        // sensación de pantalla detenida entre el envío y el primer fragmento.
        const thinkingTimers = [
            setTimeout(() => { if (!pending._hasServerStatus) setThinkingStage(pending, 'sources'); }, 480),
            setTimeout(() => { if (!pending._hasServerStatus) setThinkingStage(pending, 'reasoning'); }, 1800),
            setTimeout(() => { if (!pending._hasServerStatus) setThinkingStage(pending, 'fallback'); }, 5200),
        ];
        const clearThinkingTimers = () => thinkingTimers.forEach(timer => clearTimeout(timer));
        els.messages.scrollTop = els.messages.scrollHeight;
        try {
            // La recopilación del navegador era una segunda ronda de APIs que
            // detenía el primer fragmento entre 3 y 7 segundos. El servidor ya
            // reúne fuentes verificadas; aquí solo dejamos una gráfica
            // histórica opcional trabajando en paralelo, sin frenar el chat.
            const resolvedDataQuestion = threadDataQuestion(conversation.messages, clean);
            const historicalChartTask = Promise.resolve(
                typeof VDS !== 'undefined' && VDS.historicalUsdMxnChartSpec
                    ? VDS.historicalUsdMxnChartSpec(resolvedDataQuestion).catch(() => null)
                    : null,
            );
            let streamStarted = false;
            let streamed = await streamAnswer(clean, recent, uploaded.map(file => file.id), (partial) => {
                const firstChunk = !streamStarted;
                streamStarted = true;
                clearThinkingTimers();
                pending.row.classList.remove('is-thinking');
                pending.row.classList.add('is-streaming');
                setFaceState(pending.avatar, 'speaking');
                setConversationFaceState('speaking');
                renderStreamingText(pending, partial);
                if (firstChunk) requestAnimationFrame(() => scrollMessageToStart(pending.row, 'smooth'));
            }, '', null, (status, meta) => {
                const stage = status === 'fallback' ? 'fallback' : status === 'sources' ? 'sources' : 'reasoning';
                setThinkingStage(pending, stage, meta);
            }, requestedModelProfile);
            // La gráfica es un complemento visual. Esperamos solo un instante
            // al finalizar el texto, nunca antes de que ORION empiece a hablar.
            const historicalChart = await Promise.race([
                historicalChartTask,
                new Promise(resolve => setTimeout(() => resolve(null), 180)),
            ]);
            // El respaldo local sólo repara un SSE que no entregó una respuesta
            // estructurada. Si el modelo no pudo calcular OLS pero sí investigó
            // el mercado correcto (p. ej., cerdo australiano), no reemplazamos
            // ese análisis contextual por un aviso técnico aislado.
            if (requiresStatisticalModel(clean) && !hasCalculatedStatisticalModel(streamed)) {
                try {
                    const fallback = await statisticalFallback(clean);
                    if (hasCalculatedStatisticalModel(fallback)) {
                        streamed = mergeCalculatedStatisticalModel(streamed, fallback);
                    } else if (!streamed.rich?.blocks?.length) {
                        streamed = { ...streamed, ...fallback };
                    }
                } catch (fallbackError) {
                    // Una respuesta de investigación ya recibida vale más que
                    // perder todo el turno si la ruta estadística secundaria se
                    // encuentra temporalmente ocupada.
                    console.warn('ORION: no se pudo complementar el modelo OLS.', fallbackError.message);
                }
            }
            const result = guaranteeRequestedChart(streamed, clean, historicalChart);
            const pendingIsVisible = els.messages.contains(pending.row);
            const rowOffsetBeforeSwap = pendingIsVisible ? (pending.row.offsetTop - els.messages.scrollTop) : null;
            cancelStreamingRender(pending);
            pending._streamBody = null;
            pending._streamLive = null;
            pending.row.classList.remove('is-thinking', 'is-streaming');
            pending.bubble.classList.add('vai-stream-settled');
            setTimeout(() => pending.bubble?.classList.remove('vai-stream-settled'), 320);
            renderRich(pending.bubble, result.rich, result.text);
            animateFaceSpeech(pending.avatar, 980, result.text);
            const modelMessage = {
                role: 'model', text: result.text, rich: result.rich, ts: Date.now(), queryId: result.route?.queryId,
                evidenceCount: result.route?.evidenceCount, citations: result.route?.citations,
                retrievalStrategy: result.route?.retrievalStrategy,
                modelProfile: result.route?.modelProfile || requestedModelProfile,
                modelFallback: !!result.route?.modelFallback,
            };
            conversation.messages.push(modelMessage);
            persistConversation(conversation);
            if (!pendingIsVisible) {
                // Respaldo para cualquier redibujado externo: la respuesta
                // recién guardada se pinta desde el historial actual.
                renderConversation();
            } else {
                decorateMessage(pending.bubble, modelMessage);
                attachContentCopyActions(pending.bubble);
                attachReportActions(pending.bubble, modelMessage);
                if (shouldShowAssistantControls(modelMessage)) {
                    attachFollowUpActions(pending.bubble, modelMessage);
                    enhanceAssistantResponse(pending.bubble, modelMessage);
                }
                // Una solicitud explícita de PDF no termina en pasos manuales:
                // el informe queda listo como archivo en la propia respuesta.
                if (wantsPdfExport(clean, conversation.messages)) void prepareRequestedPdf(modelMessage, pending.bubble);
                if (!streamStarted) requestAnimationFrame(() => scrollMessageToStart(pending.row, 'smooth'));
                else if (rowOffsetBeforeSwap !== null) {
                    const nextTop = pending.row.offsetTop - rowOffsetBeforeSwap;
                    if (Math.abs(nextTop - els.messages.scrollTop) > 12) els.messages.scrollTop = Math.max(0, nextTop);
                }
            }
        } catch (error) {
            cancelStreamingRender(pending);
            pending._streamBody = null;
            pending._streamLive = null;
            pending.row.classList.remove('is-thinking', 'is-streaming');
            setFaceState(pending.avatar, 'idle');
            const bindRetry = () => {
                const retryBtn = pending.bubble.querySelector('[data-vai-retry]');
                retryBtn?.addEventListener('click', () => {
                    if (busy) return;
                    void regenerateFromMessage(userMessage, userMessage.text);
                });
            };
            if (error.name === 'AbortError') {
                const partial = String(pending._streamText || '').trim();
                if (partial) {
                    renderLegacyContent(pending.bubble, partial);
                    attachContentCopyActions(pending.bubble);
                    const stopped = document.createElement('div');
                    stopped.className = 'vai-alert vai-alert--warning';
                    stopped.innerHTML = '<div class="vai-alert-body"><strong>Generación detenida.</strong> Se conservó el texto recibido hasta el momento. <button type="button" class="vai-inline-retry" data-vai-retry><i class="fas fa-rotate-right"></i><span>Reintentar</span></button></div>';
                    pending.bubble.appendChild(stopped);
                    attachReportActions(pending.bubble, { role: 'model', text: partial, ts: Date.now() });
                } else {
                    pending.bubble.innerHTML = '<div class="vai-alert">Generación detenida. <button type="button" class="vai-inline-retry" data-vai-retry><i class="fas fa-rotate-right"></i><span>Reintentar</span></button></div>';
                }
                bindRetry();
            } else {
                pending.bubble.innerHTML = `<div class="vai-error"><strong>No pude completar la respuesta.</strong><br>${escapeHtml(error.message)}<div class="vai-error-actions"><button type="button" class="vai-inline-retry" data-vai-retry><i class="fas fa-rotate-right"></i><span>Reintentar consulta</span></button></div></div>`;
                bindRetry();
            }
            requestAnimationFrame(() => scrollMessageToStart(pending.row, 'smooth'));
        } finally {
            clearThinkingTimers();
            controller = null; setBusy(false);
            if (els.form) delete els.form.dataset.orionSending;
            els.input.focus();
            if (continuousVoiceMode) {
                if (window.speechSynthesis && !pending.bubble.querySelector('.vai-error')) {
                    if (els.voiceOverlay) {
                        els.voiceOverlay.className = 'vai-voice-overlay state-speaking';
                        if (els.voiceStatus) els.voiceStatus.textContent = 'ORION está hablando…';
                    }
                    const speakBtn = pending.bubble.querySelector('[data-speak]');
                    if (speakBtn) {
                        const originalOnEnd = speakBtn._customOnEnd;
                        speakBtn.click();
                    }
                } else {
                    if (els.voiceOverlay) {
                        els.voiceOverlay.className = 'vai-voice-overlay state-error';
                        if (els.voiceStatus) els.voiceStatus.textContent = 'Error';
                        setTimeout(() => { 
                            if (els.voiceOverlay) els.voiceOverlay.hidden = true;
                            setFaceState(els.voiceOrb, 'idle');
                            continuousVoiceMode = false;
                        }, 2000);
                    }
                }
            }
        }
    }

    function reportDraftKey() { return `vn_ai_report_draft_${activeId || 'new'}_${activeReportContext.key || 'latest'}`; }

    function reportStoredValue(key) { try { return localStorage.getItem(key); } catch { return null; } }
    function storeReportValue(key,value) { try { localStorage.setItem(key,value); } catch { /* El guardado remoto sigue disponible si el navegador está lleno. */ } }

    function setEditorMarkdown(content) {
        const source = String(content || '');
        els.reportSource.value = source;
        els.reportEditor.replaceChildren();
        const chartFence = /```chart\s*\n([\s\S]*?)```/gi;
        let cursor = 0;
        let match;
        const appendMarkdown = (fragment) => {
            if (!fragment.trim()) return;
            const holder = document.createElement('div');
            holder.innerHTML = markdown(fragment);
            holder.querySelectorAll('.vai-table-toolbar, .vai-code-head').forEach((node) => node.remove());
            while (holder.firstChild) els.reportEditor.appendChild(holder.firstChild);
        };
        while ((match = chartFence.exec(source))) {
            appendMarkdown(source.slice(cursor, match.index));
            try {
                const card = createAdvancedChart(JSON.parse(match[1]));
                card.classList.add('vai-editor-chart');
                card.contentEditable = 'false';
                const editorBar = document.createElement('div');
                editorBar.className = 'vai-editor-chart-bar';
                editorBar.innerHTML = '<span><i class="fas fa-chart-column"></i> Gráfica del reporte</span><button type="button" title="Eliminar gráfica"><i class="fas fa-trash"></i> Eliminar</button>';
                editorBar.querySelector('button').addEventListener('click', () => {
                    card.remove();
                    els.reportEditor.dispatchEvent(new Event('input', { bubbles: true }));
                });
                card.prepend(editorBar);
                els.reportEditor.appendChild(card);
            } catch {
                appendMarkdown(match[0]);
            }
            cursor = chartFence.lastIndex;
        }
        appendMarkdown(source.slice(cursor));
    }

    function inlineEditorMarkdown(node) {
        if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '').replace(/\u00a0/g, ' ');
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const tag = node.tagName.toLowerCase();
        const content = Array.from(node.childNodes).map(inlineEditorMarkdown).join('');
        if (tag === 'strong' || tag === 'b') return `**${content}**`;
        if (tag === 'em' || tag === 'i') return `*${content}*`;
        if (tag === 'code') return `\`${content}\``;
        if (tag === 'br') return '\n';
        if (tag === 'a') return `[${content}](${node.getAttribute('href') || ''})`;
        return content;
    }

    function editorBlockMarkdown(node) {
        if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '').trim();
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        if (node.classList.contains('vai-table-toolbar') || node.classList.contains('vai-code-head')) return '';
        if (node.classList.contains('vai-editor-chart')) {
            const serialized = node.dataset.chartSpec || '{}';
            return `\`\`\`chart\n${serialized}\n\`\`\``;
        }
        const tag = node.tagName.toLowerCase();
        if (/^h[1-4]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inlineEditorMarkdown(node).trim()}`;
        if (tag === 'p') return inlineEditorMarkdown(node).trim();
        if (tag === 'blockquote' || node.classList.contains('vai-quote')) return inlineEditorMarkdown(node).split('\n').map(line => `> ${line}`).join('\n');
        if (tag === 'pre') {
            const code = node.querySelector('code'); const language = code?.dataset.language || '';
            return `\`\`\`${language}\n${code?.textContent || node.textContent || ''}\n\`\`\``;
        }
        if (tag === 'hr') return '---';
        if (tag === 'ul' || tag === 'ol') return Array.from(node.children).map((item, index) => `${tag === 'ol' ? `${index + 1}.` : '-'} ${inlineEditorMarkdown(item).trim()}`).join('\n');
        if (tag === 'table') {
            const rows = Array.from(node.querySelectorAll('tr')).map(row => Array.from(row.children).map(cell => inlineEditorMarkdown(cell).trim()));
            if (!rows.length) return '';
            return `| ${rows[0].join(' | ')} |\n| ${rows[0].map(() => '---').join(' | ')} |\n${rows.slice(1).map(row => `| ${row.join(' | ')} |`).join('\n')}`;
        }
        if (tag === 'div' && node.querySelector(':scope > table')) return editorBlockMarkdown(node.querySelector(':scope > table'));
        return Array.from(node.childNodes).map(editorBlockMarkdown).filter(Boolean).join('\n\n');
    }

    function syncEditorSource() {
        els.reportSource.value = Array.from(els.reportEditor.childNodes).map(editorBlockMarkdown).filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
        return els.reportSource.value;
    }

    function reportContent() { return els.reportSource.value || syncEditorSource(); }

    function hasReportIntent(text) {
        return /\b(reportes?|informes?|documentos?|exportar|exporta|word|pdf)\b/i.test(String(text || ''));
    }

    function reportTitleFrom(answer, question) {
        const headings = Array.from(String(answer || '').matchAll(/^#{1,4}\s+(.+)$/gm)).map(match => match[1].trim());
        const reportHeading = headings.find(value => /\b(reporte|informe|documento)\b/i.test(value));
        if (reportHeading) return reportHeading.slice(0, 110);
        if (headings[0]) return headings[0].slice(0, 110);
        const subject = String(question || '').replace(/^.*?\b(?:reporte|informe|documento)\b\s*(?:sobre|de)?\s*/i, '').replace(/[.?!]+$/g, '').trim();
        return (subject ? `Reporte: ${subject}` : activeConversation()?.title || 'Reporte ORION').slice(0, 110);
    }

    function isolateRequestedReport(answer) {
        const text = String(answer || '').trim();
        const reportHeading = text.match(/^#{1,4}\s+.*\b(?:reporte|informe|documento)\b.*$/im);
        let isolated = reportHeading ? text.slice(reportHeading.index).trim() : text;
        if (!/```chart\b/i.test(isolated)) {
            const charts = Array.from(text.matchAll(/```chart\s*\n[\s\S]*?```/gi), match => match[0]);
            if (charts.length) isolated += `\n\n## Gráficas del análisis\n\n${charts.join('\n\n')}`;
        }
        return isolated;
    }

    function reportContextFor(selectedMessage = null) {
        const conversation = selectedMessage && !(selectedMessage instanceof Event)
            ? conversations.find(item => item.messages?.some(message => message === selectedMessage || message.id === selectedMessage.id))
            : activeConversation();
        const messages = conversation?.messages?.filter(message => !message._hidden) || [];
        let modelIndex = -1;
        if (selectedMessage && !(selectedMessage instanceof Event)) {
            modelIndex = messages.findIndex(message => message === selectedMessage || message.id === selectedMessage.id);
        }
        if (modelIndex < 0) {
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (messages[index].role !== 'user' || !hasReportIntent(messages[index].text)) continue;
                const responseIndex = messages.findIndex((message, candidate) => candidate > index && (message.role === 'model' || message.role === 'assistant'));
                if (responseIndex >= 0) { modelIndex = responseIndex; break; }
            }
        }
        if (modelIndex < 0) {
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (messages[index].role === 'model' || messages[index].role === 'assistant') { modelIndex = index; break; }
            }
        }
        const model = messages[modelIndex] || null;
        let user = null;
        for (let index = modelIndex - 1; index >= 0; index -= 1) if (messages[index].role === 'user') { user = messages[index]; break; }
        if (!model) {
            return { key: 'manual', title: 'Reporte ORION', content: '# Reporte ORION\n\nEscribe aquí el contenido del reporte.', label: 'Documento manual' };
        }
        const isolated = isolateRequestedReport(model.text);
        const title = reportTitleFrom(isolated, user?.text);
        const heading = isolated.match(/^#{1,4}\s+(.+)\n*/);
        const body = heading && heading[1].trim().toLowerCase() === title.toLowerCase() ? isolated.slice(heading[0].length).trim() : isolated;
        const content = [`# ${title}`, '', `**Fecha:** ${new Date(model.ts || Date.now()).toLocaleString('es-MX')}`, '', body, '', '---', '', '*Documento informativo. Verifica las cifras relevantes antes de tomar decisiones.*'].join('\n').trim();
        return {
            key: `response_${model.ts || modelIndex}`,
            messageId: model.id,
            conversationId: conversation.id,
            title,
            content,
            label: hasReportIntent(user?.text) ? 'Reporte solicitado detectado' : 'Respuesta seleccionada',
        };
    }



    function openReportStudio(selectedMessage = null) {
        activeReportContext = reportContextFor(selectedMessage);
        if (els.reportLibrary) els.reportLibrary.hidden = true;
        const saved = reportStoredValue(reportDraftKey());
        els.reportTitle.value = reportStoredValue(reportDraftKey() + ':title') || activeReportContext.title;
        els.reportScope.innerHTML = `<i class="fas fa-crosshairs"></i> ${escapeHtml(activeReportContext.label)}`;
        setEditorMarkdown(saved || activeReportContext.content);
        els.reportStudio.hidden = false;
        document.body.style.overflow = 'hidden';
        setReportView(reportStoredValue('vn_ai_report_view') || (window.innerWidth <= 760 ? 'preview' : 'split'));
        renderReportPreview();
        setTimeout(() => {
            const range = document.createRange(); range.selectNodeContents(els.reportEditor); range.collapse(true);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); els.reportEditor.scrollTop = 0;
            if (els.reportBody.dataset.view !== 'preview') els.reportEditor.focus();
        }, 80);
    }

    function closeReportStudio() {
        els.reportStudio.hidden = true;
        document.body.style.overflow = '';
    }

    function setReportView(view) {
        const selected = ['edit', 'split', 'preview'].includes(view) ? view : 'split';
        els.reportBody.dataset.view = selected;
        document.querySelectorAll('[data-report-view]').forEach(button => button.classList.toggle('active', button.dataset.reportView === selected));
        storeReportValue('vn_ai_report_view', selected);
        if (selected !== 'edit') renderReportPreview();
        if (selected === 'edit') setTimeout(() => els.reportEditor.focus(), 50);
    }

    async function saveReportDraft() {
        if (els.reportSave.disabled) return;
        const draftKey = reportDraftKey(), context = activeReportContext;
        const content = reportContent(), title = els.reportTitle.value.trim() || 'Reporte ORION';
        storeReportValue(draftKey, content);
        storeReportValue(draftKey + ':title', title);
        renderReportPreview();
        els.reportSave.disabled = true;
        els.reportStatus.textContent = 'Guardando en Mis informes…';
        try {
            const sessionResponse = await fetch('/api/verify-token', { credentials:'include', cache:'no-store' });
            const session = await sessionResponse.json();
            if (!sessionResponse.ok || !session.email) throw Error('Inicia sesión para guardar en Mis informes. El borrador queda en este navegador.');
            const metadataKey = draftKey + ':edition:' + encodeURIComponent(session.email.toLowerCase());
            let previous; try { previous = reportEditionMetadata.get(metadataKey) || JSON.parse(reportStoredValue(metadataKey) || 'null'); } catch { /* Metadata inválida: crear un documento nuevo. */ }
            const sections = [];
            for (let index = 0; index < content.length; index += 8000) sections.push({ heading: sections.length ? 'Continuación' : 'Informe ORION', text:content.slice(index,index+8000) });
            const response = await fetch('/api/user-reports', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:previous?.id, version:previous?.version, report:{title,eyebrow:'Informe creado con ORION',sections,generatedAt:new Date().toISOString()} }) });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw Error(payload.error || 'No se pudo guardar en tu cuenta. El borrador sigue en este navegador.');
            const metadata = {id:payload.data.editionId,version:payload.data.editionVersion};
            reportEditionMetadata.set(metadataKey,metadata);storeReportValue(metadataKey,JSON.stringify(metadata));
            if (activeReportContext !== context) return;
            els.reportStatus.replaceChildren(document.createTextNode(payload.storage === 'temporary_runtime' ? 'Informe guardado temporalmente. Descarga el PDF para conservarlo. ' : 'Informe guardado. '));
            const link = document.createElement('a'); link.href = '/informes?informe=' + encodeURIComponent(payload.data.editionId); link.textContent = 'Ver en Mis informes'; els.reportStatus.append(link);
            if (els.reportLibrary) {els.reportLibrary.href = link.href; els.reportLibrary.hidden = false;}
        } catch (error) { if (activeReportContext === context) els.reportStatus.textContent = error.message; }
        finally { els.reportSave.disabled = false; }
    }

    function formatEditor(command, value = null) {
        els.reportEditor.focus();
        document.execCommand(command, false, value);
        els.reportEditor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function renderReportPreview() {
        const content = reportContent();
        storeReportValue(reportDraftKey(), content);
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        els.reportWords.textContent = `${words} palabras`;
        els.reportPreview.replaceChildren();
        const reportTitle = els.reportTitle.value.trim() || 'Reporte ORION';
        const masthead = document.createElement('header'); masthead.className = 'vai-paper-masthead';
        masthead.innerHTML = '<span>VALLNEWS</span><small>INTELIGENCIA ECONÓMICA</small><b>REPORTE DE ANÁLISIS</b>';
        const title = document.createElement('h1'); title.textContent = reportTitle;
        const meta = document.createElement('div'); meta.className = 'vai-paper-meta';
        meta.innerHTML = `<span><i class="fas fa-calendar"></i>${escapeHtml(new Date().toLocaleDateString('es-MX', { dateStyle: 'long' }))}</span><span><i class="fas fa-wand-magic-sparkles"></i>Preparado con ORION</span><span><i class="fas fa-file-lines"></i>${words} palabras</span>`;
        const cleanContent = content.replace(/^#\s+(.+)\n+/, (match, firstTitle) => firstTitle.trim().toLowerCase() === reportTitle.toLowerCase() ? '' : match);
        const body = document.createElement('div'); body.className = 'vai-paper-content'; renderLegacyContent(body, cleanContent);
        body.querySelectorAll('.vai-table-toolbar, .vai-code-head').forEach((node) => node.remove());
        const footer = document.createElement('footer'); footer.className = 'vai-paper-footer'; footer.innerHTML = '<span>VALLNews · Documento informativo</span><span>Generado para revisión y edición</span>';
        els.reportPreview.append(masthead, title, meta, body, footer);
        els.reportPreview.style.zoom = `${Number(els.reportZoom?.value) || 100}%`;
        els.reportStatus.textContent = 'Vista previa actualizada';
    }

    function previewHtmlWithChartImages() {
        const clone = els.reportPreview.cloneNode(true);
        const originals = els.reportPreview.querySelectorAll('canvas');
        const copies = clone.querySelectorAll('canvas');
        copies.forEach((canvas, index) => {
            try {
                const image = document.createElement('img'); image.src = originals[index].toDataURL('image/png', 1); image.alt = 'Gráfica del reporte'; image.style.cssText = 'display:block;max-width:100%;margin:14px auto;'; canvas.replaceWith(image);
            } catch { canvas.remove(); }
        });
        clone.querySelectorAll('.vai-chart-tools').forEach((node) => node.remove());
        return clone.innerHTML;
    }





    function chartImageForExport(card) {
        const source = card?.querySelector('canvas');
        if (!source?.width || !source?.height) return null;
        try {
            // La vista del chat usa un fondo oscuro, pero el informe se lee
            // sobre papel. Re-renderizamos sólo para la captura con una
            // cuadrícula clara y texto oscuro; después se restaura el tema del
            // chat. Así las etiquetas no desaparecen al exportar a PDF.
            const chart = chartInstances.get(source);
            const scales = chart?.options?.scales || {};
            const legend = chart?.options?.plugins?.legend?.labels;
            const originalTheme = chart ? {
                legend: legend?.color,
                xTicks: scales.x?.ticks?.color, yTicks: scales.y?.ticks?.color,
                xGrid: scales.x?.grid?.color, yGrid: scales.y?.grid?.color,
                animation: chart.options.animation,
            } : null;
            if (chart) {
                if (legend) legend.color = '#334155';
                if (scales.x?.ticks) scales.x.ticks.color = '#475569';
                if (scales.y?.ticks) scales.y.ticks.color = '#475569';
                if (scales.x?.grid) scales.x.grid.color = 'rgba(148,163,184,.18)';
                if (scales.y?.grid) scales.y.grid.color = 'rgba(148,163,184,.26)';
                chart.options.animation = false;
                chart.update('none');
            }
            const ratio = Math.max(1, Number(window.devicePixelRatio) || 1);
            const title = String(card.querySelector('.vai-chart-head h3')?.textContent || 'Gráfica del análisis').trim();
            const top = Math.round(58 * ratio);
            const inset = Math.round(18 * ratio);
            const output = document.createElement('canvas');
            output.width = source.width;
            output.height = source.height + top;
            const context = output.getContext('2d');
            context.fillStyle = '#FFFFFF';
            context.fillRect(0, 0, output.width, output.height);
            context.fillStyle = '#2563EB';
            context.font = `700 ${Math.max(9, Math.round(8 * ratio))}px Inter, Arial, sans-serif`;
            context.textBaseline = 'middle';
            context.fillText('ORION · VISUALIZACIÓN CUANTITATIVA', inset, Math.round(15 * ratio));
            context.fillStyle = '#0F172A';
            context.font = `700 ${Math.max(16, Math.round(15 * ratio))}px Inter, Arial, sans-serif`;
            context.textBaseline = 'middle';
            context.fillText(title.slice(0, 100), inset, Math.round(37 * ratio));
            context.strokeStyle = '#CBD5E1';
            context.lineWidth = Math.max(1, ratio);
            context.beginPath(); context.moveTo(0, top - Math.round(1 * ratio)); context.lineTo(output.width, top - Math.round(1 * ratio)); context.stroke();
            context.drawImage(source, 0, top);
            const data = output.toDataURL('image/png', 1);
            if (chart && originalTheme) {
                if (legend) legend.color = originalTheme.legend;
                if (scales.x?.ticks) scales.x.ticks.color = originalTheme.xTicks;
                if (scales.y?.ticks) scales.y.ticks.color = originalTheme.yTicks;
                if (scales.x?.grid) scales.x.grid.color = originalTheme.xGrid;
                if (scales.y?.grid) scales.y.grid.color = originalTheme.yGrid;
                chart.options.animation = originalTheme.animation;
                chart.update('none');
            }
            return data;
        } catch { return null; }
    }

    function collectChartImages(container) {
        return Array.from(container?.querySelectorAll('.vai-chart-card') || [])
            .slice(0, 8).map(chartImageForExport).filter(Boolean);
    }

    async function waitForRenderedCharts(container) {
        const cards = Array.from(container?.querySelectorAll('.vai-chart-card') || []);
        await Promise.all(cards.map(card => Promise.resolve(card._vaiChartReady).catch(() => null)));
        if (cards.length) {
            // Esperamos a que terminen las animaciones de Chart.js (650ms + margen)
            await new Promise(resolve => setTimeout(resolve, 850));
        }
    }

    function triggerExportDownload(result) {
        if (!result?.downloadUrl) return;
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.filename || 'reporte-orion';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async function createServerExport(title, content, format, container) {
        await waitForRenderedCharts(container);
        const response = await fetch('/api/report-export', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, format,language:window.VNReportArtifacts?.selectedLanguage?.() || document.documentElement.lang || 'es',chartImages: collectChartImages(container) }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.downloadUrl) throw new Error(data.error || `No se pudo crear el archivo (${response.status}).`);
        return data;
    }

    async function requestServerExport(title, content, format, container) {
        const result = await createServerExport(title, content, format, container);
        triggerExportDownload(result);
        return result;
    }

    async function exportReport() {
        renderReportPreview();
        const title = els.reportTitle.value.trim() || 'Reporte ORION';
        const filename = sanitizeFilename(title);
        const content = reportContent();
        const format = els.reportFormat.value;
        const linkedMessage = conversations.find(item => item.id === activeReportContext?.conversationId)?.messages.find(message => message.id === activeReportContext?.messageId);
        els.reportExport.disabled = true; els.reportStatus.textContent = 'Preparando archivo…';
        try {
            const result = await requestServerExport(title, content, format, els.reportPreview);
            if (format === 'pdf' && linkedMessage) savePdfPreview(linkedMessage, { ...result, title, recipe: { title, content } });
            els.reportStatus.textContent = `Archivo listo: ${result.filename}`;
        } catch (error) {
            els.reportStatus.textContent = error.message || 'No se pudo exportar';
        } finally { els.reportExport.disabled = false; }
    }

    function updateScrollBottomButton() {
        if (!els.scrollBottom || !els.messages) return;
        const hasThread = !els.welcome?.parentNode || els.welcome.hidden;
        const distanceFromBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
        els.scrollBottom.hidden = !hasThread || distanceFromBottom < 140;
    }

    function resizeInput() {
        els.input.style.height = '0px';
        const compactViewport = window.matchMedia('(max-width: 760px)').matches;
        const maxHeight = compactViewport ? 180 : 220;
        const height = Math.min(Math.max(els.input.scrollHeight, 44), maxHeight);
        els.input.style.height = `${height}px`;
        els.input.style.overflowY = els.input.scrollHeight > maxHeight ? 'auto' : 'hidden';
        els.form.classList.toggle('is-expanded', height > 60);
        if (els.charCount) {
            const len = els.input.value.length;
            els.charCount.hidden = len < 3000;
            if (len >= 3000) {
                els.charCount.textContent = `${len.toLocaleString('es-MX')} / 12,000`;
                els.charCount.classList.toggle('is-warn', len >= 10500);
            }
        }
    }
    function isMobileSidebar() { return window.matchMedia('(max-width: 760px)').matches; }
    function setSidebarCollapsed(collapsed, persist = true) {
        if (isMobileSidebar()) {
            els.shell.classList.remove('sidebar-collapsed'); els.sidebar.classList.remove('collapsed');
            return;
        }
        const value = Boolean(collapsed);
        els.shell.classList.toggle('sidebar-collapsed', value);
        els.sidebar.classList.toggle('collapsed', value);
        els.sidebarCollapse.setAttribute('aria-expanded', String(!value));
        const sidebarAction = value ? 'Abrir historial' : 'Contraer historial';
        els.sidebarCollapse.setAttribute('aria-label', sidebarAction);
        els.sidebarCollapse.title = sidebarAction;
        els.sidebarCollapse.querySelector('i').className = `fas fa-chevron-${value ? 'right' : 'left'}`;
        els.sidebarCollapse.querySelector('.vai-sidebar-collapse-copy').textContent = sidebarAction;
        if (persist) localStorage.setItem(SIDEBAR_KEY, value ? '1' : '0');
    }
    function toggleSidebar() { setSidebarCollapsed(!els.sidebar.classList.contains('collapsed')); }
    function focusHistorySearch() {
        // En el rail compacto la búsqueda sigue disponible como acción. Al
        // activarla se expande el panel y el cursor llega directamente al
        // filtro, igual que en un chat de escritorio.
        if (isMobileSidebar()) openSidebar();
        else setSidebarCollapsed(false);
        els.sidebar.classList.add('searching');
        requestAnimationFrame(() => {
            els.historySearch?.focus();
            els.historySearch?.select();
        });
    }
    function openSidebar() {
        if (!isMobileSidebar()) { setSidebarCollapsed(false); return; }
        els.sidebar.classList.add('open'); els.overlay.classList.add('open');
        els.historyToggle?.setAttribute('aria-expanded', 'true');
    }
    function closeSidebar() {
        els.sidebar.classList.remove('open'); els.overlay.classList.remove('open');
        els.historyToggle?.setAttribute('aria-expanded', 'false');
    }

    const SLASH_COMMANDS = [
        { command: '/proteinas', title: 'Comparar proteínas', hint: 'Pollo, cerdo, res y huevo (kg/USD)', icon: 'fa-drumstick-bite', keywords: 'pollo res cerdo huevo carne kilogramo usd mxn', template: 'Compara los precios vigentes por kilogramo (y equivalente USD/kg) de pollo, cerdo, res y huevo en ' },
        { command: '/mexico', title: 'Mercados de México', hint: 'SNIIM, USDA y precios nacionales', icon: 'fa-pepper-hot', keywords: 'mexico sniim nacional cdmx guadalajara monterrey maiz', template: 'Analiza los precios más recientes en México de pollo, res, cerdo, huevo y granos (SNIIM / USDA) con fuentes fechadas', suffixTemplate: ' enfocándote en ' },
        { command: '/pronostico', title: 'Pronóstico ML + IC 90%', hint: 'Proyección cuantitativa con intervalos', icon: 'fa-chart-line', keywords: 'ml prediccion futuro semanas bandas tendencia modelo', template: 'Proyecta un pronóstico ML a 12 semanas con intervalos de confianza del 90% y gráfica interactiva para ' },
        { command: '/loopus', title: 'Modelos Loopus', hint: 'Inteligencia cuantitativa interna', icon: 'fa-microchip', keywords: 'loopus benchmark regresion elasticidad variables', template: 'Resume los últimos análisis y modelos cuantitativos de Loopus disponibles en la plataforma sobre ' },
        { command: '/margen', title: 'Cálculo de margen', hint: 'Costo unitario, margen neto y equilibrio', icon: 'fa-calculator', keywords: 'costo ganancia utilidad equilibrio negocio finanzas', template: 'Calcula costo unitario, margen bruto/neto y punto de equilibrio con los siguientes supuestos: ' },
        { command: '/grafica', title: 'Tabla + Gráfica', hint: 'Comparativa visual interactiva', icon: 'fa-chart-column', keywords: 'chart visual comparativa barras lineas', template: 'Genera una tabla comparativa verificada y una gráfica interactiva actualizada de ' },
        { command: '/reporte', title: 'Abrir Editor de reportes', hint: 'Acción · redactar y exportar informe', icon: 'fa-file-pen', keywords: 'estudio studio documento informe pdf word', action: () => { closeSidebar(); openReportStudio(); } },
        { command: '/exportar', title: 'Exportar este chat', hint: 'Acción · descarga .md, .txt, .pdf o .docx', icon: 'fa-download', keywords: 'descargar markdown txt pdf word historial', action: (args) => exportActiveConversation(normalizeConversationExportFormat(args || 'md')) },
    ];

    function normalizeConversationExportFormat(raw) {
        const value = String(raw || '').trim().toLowerCase().replace(/^\./, '');
        if (value === 'txt' || value === 'texto' || value === 'text') return 'txt';
        if (value === 'pdf') return 'pdf';
        if (value === 'docx' || value === 'doc' || value === 'word') return 'docx';
        return 'md';
    }

    function closeExportMenu() {
        if (els.exportMenu) els.exportMenu.hidden = true;
        els.exportChat?.setAttribute('aria-expanded', 'false');
    }

    function syncExportChatAvailability() {
        if (!els.exportChat) return;
        const canExport = hasConversationMessages(activeConversation()) && !busy && !exportBusy;
        els.exportChat.disabled = !canExport;
        if (!canExport) closeExportMenu();
    }

    function setExportFeedback(label, restoreAfterMs = 0) {
        clearTimeout(exportFeedbackTimer);
        const span = els.exportChat?.querySelector('span');
        if (span) span.textContent = label;
        if (restoreAfterMs > 0) {
            exportFeedbackTimer = setTimeout(() => {
                const currentSpan = els.exportChat?.querySelector('span');
                if (currentSpan && !exportBusy) currentSpan.textContent = 'Exportar chat';
            }, restoreAfterMs);
        }
    }

    function toggleExportMenu() {
        if (!els.exportChat || !els.exportMenu || els.exportChat.disabled) return;
        if (els.sidebar.classList.contains('collapsed') && !isMobileSidebar()) setSidebarCollapsed(false);
        const nextHidden = !els.exportMenu.hidden;
        els.exportMenu.hidden = nextHidden;
        els.exportChat.setAttribute('aria-expanded', String(!nextHidden));
    }

    function buildConversationTranscriptMarkdown(conversation) {
        if (!conversation) return '';
        const visible = (Array.isArray(conversation.messages) ? conversation.messages : []).filter((m) => !m?._hidden);
        if (!visible.length) return '';
        const title = String(conversation.title || 'Conversación ORION').trim();
        const exportedAt = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
        const lines = [
            `# ${title}`,
            '',
            `_Exportado desde VALLNews ORION · ${exportedAt} · ${visible.length} mensajes${isConversationPinned(conversation.id) ? ' · Fijado' : ''}_`,
            '',
            '---',
            '',
        ];
        visible.forEach((message, idx) => {
            const isUser = message.role === 'user';
            const modelName = !isUser ? (message.rich?.modelUsed || message.model || '') : '';
            const speaker = isUser ? 'Usuario' : (modelName ? `ORION (${modelName})` : 'ORION');
            const stamp = message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}` : '';
            lines.push(`## ${idx + 1}. ${speaker}${stamp}`, '');
            if (Array.isArray(message.files) && message.files.length) {
                lines.push(`_Adjuntos: ${message.files.map((f) => f?.name || 'archivo').join(', ')}_`, '');
            }
            const body = String(message.text || '').trim();
            if (body) lines.push(body, '');
            const sources = Array.isArray(message.rich?.sources) ? message.rich.sources.filter((s) => s?.url) : [];
            if (sources.length) {
                const seen = new Set();
                const unique = sources.filter((s) => {
                    if (seen.has(s.url)) return false;
                    seen.add(s.url);
                    return true;
                });
                lines.push('**Fuentes consultadas:**');
                unique.slice(0, 12).forEach((s) => {
                    const label = String(s.title || s.source || s.url).replace(/[[\]]/g, '').trim();
                    lines.push(`- [${label}](${s.url})${s.source ? ` (${s.source})` : ''}`);
                });
                lines.push('');
            }
            lines.push('---', '');
        });
        return lines.join('\n').trim() + '\n';
    }

    function markdownToPlainTranscript(md) {
        return String(md || '')
            .replace(/```chart[\s\S]*?```/gi, '[Gráfica interactiva incluida en la versión web/PDF]')
            .replace(/```[\w+-]*\n([\s\S]*?)```/g, '$1')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^---$/gm, '========================================')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/_(.*?)_/g, '$1')
            .replace(/\n{3,}/g, '\n\n')
            .trim() + '\n';
    }

    function downloadTextBlob(fileName, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
    }

    async function exportActiveConversation(formatInput = 'md') {
        closeExportMenu();
        const conversation = activeConversation();
        if (!hasConversationMessages(conversation) || exportBusy) return;
        const format = normalizeConversationExportFormat(formatInput);
        const title = String(conversation.title || 'Conversación ORION').trim();
        const baseName = `${sanitizeFilename(title)}.${format}`;
        const transcriptMd = buildConversationTranscriptMarkdown(conversation);
        if (!transcriptMd) return;
        if (format === 'md' || format === 'txt') {
            const payload = format === 'txt' ? markdownToPlainTranscript(transcriptMd) : transcriptMd;
            const mime = format === 'txt' ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8';
            downloadTextBlob(baseName, payload, mime);
            setExportFeedback('Exportado ✓', 2200);
            return;
        }
        exportBusy = true;
        syncExportChatAvailability();
        setExportFeedback('Exportando…');
        try {
            await requestServerExport(title, transcriptMd, format, els.messages);
            exportBusy = false;
            syncExportChatAvailability();
            setExportFeedback('Exportado ✓', 2400);
        } catch {
            exportBusy = false;
            syncExportChatAvailability();
            setExportFeedback('Error al exportar', 2800);
        }
    }

    function parseSlashQuery(value) {
        const raw = String(value || '');
        if (!raw.startsWith('/') || /\s/.test(raw)) return null;
        return raw.slice(1).toLowerCase();
    }

    function filterSlashCommands(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return SLASH_COMMANDS;
        return SLASH_COMMANDS.filter((item) => {
            const slug = item.command.slice(1).toLowerCase();
            return slug.includes(q) || item.title.toLowerCase().includes(q) || item.keywords.includes(q);
        });
    }

    function closeSlashMenu() {
        slashVisibleItems = [];
        slashActiveIndex = 0;
        if (!els.slashMenu) return;
        els.slashMenu.hidden = true;
        els.slashMenu.replaceChildren();
    }

    function highlightSlashItem(index) {
        if (!els.slashMenu || !slashVisibleItems.length) return;
        slashActiveIndex = ((index % slashVisibleItems.length) + slashVisibleItems.length) % slashVisibleItems.length;
        Array.from(els.slashMenu.children).forEach((node, idx) => {
            const active = idx === slashActiveIndex;
            node.classList.toggle('is-active', active);
            node.setAttribute('aria-selected', String(active));
            if (active) node.scrollIntoView({ block: 'nearest' });
        });
    }

    function applySlashCommand(item) {
        if (!item) return;
        closeSlashMenu();
        slashDismissedValue = '';
        if (typeof item.action === 'function') {
            els.input.value = '';
            resizeInput();
            refreshComposerFace();
            item.action('');
            return;
        }
        els.input.value = item.template;
        resizeInput();
        refreshComposerFace();
        els.input.focus();
        els.input.setSelectionRange(els.input.value.length, els.input.value.length);
    }

    function renderSlashMenu() {
        if (!els.slashMenu) return;
        const raw = els.input.value;
        if (slashDismissedValue && raw === slashDismissedValue) { closeSlashMenu(); return; }
        slashDismissedValue = '';
        const query = parseSlashQuery(raw);
        if (query === null) { closeSlashMenu(); return; }
        const matches = filterSlashCommands(query);
        if (!matches.length) { closeSlashMenu(); return; }
        slashVisibleItems = matches;
        if (slashActiveIndex >= matches.length) slashActiveIndex = 0;
        els.slashMenu.replaceChildren();
        matches.forEach((item, idx) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'vai-slash-item' + (idx === slashActiveIndex ? ' is-active' : '');
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(idx === slashActiveIndex));
            option.innerHTML = `<span class="vai-slash-ico"><i class="fas ${escapeHtml(item.icon)}" aria-hidden="true"></i></span><span class="vai-slash-copy"><span class="vai-slash-top"><strong class="vai-slash-cmd">${escapeHtml(item.command)}</strong><span class="vai-slash-title">${escapeHtml(item.title)}</span></span><small class="vai-slash-hint">${escapeHtml(item.hint)}</small></span>`;
            option.addEventListener('mousedown', (event) => event.preventDefault());
            option.addEventListener('click', () => applySlashCommand(item));
            els.slashMenu.appendChild(option);
        });
        els.slashMenu.hidden = false;
    }

    function resolveSlashSubmission(rawValue) {
        const text = String(rawValue || '').trim();
        const match = text.match(/^(\/[a-z0-9_-]+)(?:\s+([\s\S]+))?$/i);
        if (!match) return { handled: false, text };
        const cmdName = match[1].toLowerCase();
        const args = String(match[2] || '').trim();
        const found = SLASH_COMMANDS.find((item) => item.command === cmdName);
        if (!found) return { handled: false, text };
        if (typeof found.action === 'function') {
            els.input.value = '';
            closeSlashMenu();
            resizeInput();
            found.action(args);
            return { handled: true, text: '' };
        }
        const prompt = found.suffixTemplate
            ? (args ? `${found.template}${found.suffixTemplate}${args}` : `${found.template}.`)
            : (args ? `${found.template}${args}` : found.template);
        return { handled: false, text: prompt.trim() };
    }

    const refreshComposerFace = () => {
        if (!busy) setConversationFaceState(els.input.value.trim() || document.activeElement === els.input ? 'listening' : 'idle');
    };
    els.form.addEventListener('submit', (event) => {
        event.preventDefault();
        closeSlashMenu();
        const resolved = resolveSlashSubmission(els.input.value);
        if (resolved.handled) return;
        sendMessage(resolved.text);
    });
    els.input.addEventListener('input', () => { resizeInput(); refreshComposerFace(); renderSlashMenu(); });
    els.input.addEventListener('focus', refreshComposerFace);
    els.input.addEventListener('blur', refreshComposerFace);
    els.attach.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', () => { addFiles(els.fileInput.files); els.fileInput.value = ''; });
    els.input.addEventListener('paste', (event) => {
        const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/') || normalizedFileType(file));
        if (files.length) addFiles(files);
    });
    ['dragenter', 'dragover'].forEach(type => els.form.addEventListener(type, (event) => { event.preventDefault(); els.dropzone.hidden = false; }));
    els.form.addEventListener('dragleave', (event) => { if (!els.form.contains(event.relatedTarget)) els.dropzone.hidden = true; });
    els.form.addEventListener('drop', (event) => { event.preventDefault(); els.dropzone.hidden = true; addFiles(event.dataTransfer?.files); });
    els.input.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (els.slashMenu && !els.slashMenu.hidden && slashVisibleItems.length) {
            if (event.key === 'ArrowDown') { event.preventDefault(); highlightSlashItem(slashActiveIndex + 1); return; }
            if (event.key === 'ArrowUp') { event.preventDefault(); highlightSlashItem(slashActiveIndex - 1); return; }
            if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                event.preventDefault();
                applySlashCommand(slashVisibleItems[slashActiveIndex]);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                slashDismissedValue = els.input.value;
                closeSlashMenu();
                return;
            }
        }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); els.form.requestSubmit(); return; }
        if (event.key === 'ArrowUp' && !els.input.value.trim()) {
            const lastUser = [...(activeConversation()?.messages || [])].reverse().find(m => m.role === 'user' && m.text);
            if (lastUser) {
                event.preventDefault();
                els.input.value = lastUser.text;
                resizeInput();
                els.input.setSelectionRange(els.input.value.length, els.input.value.length);
            }
        }
    });
    els.messages?.addEventListener('scroll', updateScrollBottomButton, { passive: true });
    els.scrollBottom?.addEventListener('click', () => {
        els.messages?.scrollTo({ top: els.messages.scrollHeight, behavior: 'smooth' });
    });
    els.historySearch.addEventListener('input', renderHistory);
    els.historySearchClear?.addEventListener('click', () => {
        els.historySearch.value = '';
        renderHistory();
        els.historySearch.focus();
    });
    els.historySearch.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        els.historySearch.value = '';
        els.sidebar.classList.remove('searching');
        renderHistory();
        els.historySearch.blur();
    });
    els.newChat.addEventListener('click', startNewConversation);
    els.quickSearch?.addEventListener('click', focusHistorySearch);
    $('vaiOpenReportStudio')?.addEventListener('click', () => { closeSidebar(); openReportStudio(); });
    els.exportChat?.addEventListener('click', (event) => { event.stopPropagation(); toggleExportMenu(); });
    els.exportMenu?.querySelectorAll('[data-chat-export]').forEach((button) => {
        button.addEventListener('click', () => exportActiveConversation(button.dataset.chatExport));
    });
    escucharGlobal(document, 'click', (event) => {
        if (els.exportMenu && !els.exportMenu.hidden && els.exportWrap && !els.exportWrap.contains(event.target)) {
            closeExportMenu();
        }
        if (els.slashMenu && !els.slashMenu.hidden && els.form && !els.form.contains(event.target)) {
            closeSlashMenu();
        }
    });
    els.historyToggle?.addEventListener('click', () => els.sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
    els.stop.addEventListener('click', () => controller?.abort());
    els.sidebarCollapse.addEventListener('click', toggleSidebar); els.sideClose.addEventListener('click', closeSidebar); els.overlay.addEventListener('click', closeSidebar);
    document.querySelectorAll('[data-report-close]').forEach((button) => button.addEventListener('click', closeReportStudio));
    els.reportRefresh.addEventListener('click', renderReportPreview);
    els.reportExport.addEventListener('click', exportReport);
    els.reportZoom.addEventListener('change', renderReportPreview);
    els.reportSave.addEventListener('click', saveReportDraft);
    document.querySelectorAll('[data-report-view]').forEach(button => button.addEventListener('click', () => setReportView(button.dataset.reportView)));
    document.querySelectorAll('[data-editor-command]').forEach(button => button.addEventListener('click', () => formatEditor(button.dataset.editorCommand, button.dataset.editorValue || null)));
    els.reportTitle.addEventListener('input', () => {
        clearTimeout(reportRenderTimer); reportRenderTimer = setTimeout(renderReportPreview, 260);
    });
    els.reportEditor.addEventListener('input', () => {
        syncEditorSource();
        els.reportStatus.textContent = 'Editando…';
        clearTimeout(reportRenderTimer); reportRenderTimer = setTimeout(renderReportPreview, 420);
    });
    els.reportEditor.addEventListener('paste', (event) => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '');
    });
    escucharGlobal(document, 'keydown', (event) => {
        if (event.key === 'Escape' && els.exportMenu && !els.exportMenu.hidden) { closeExportMenu(); els.exportChat?.focus(); }
        if (event.key === 'Escape' && !els.reportStudio.hidden) closeReportStudio();
        if (event.key === 'Escape' && els.sidebar.classList.contains('open')) {
            closeSidebar();
            els.historyToggle?.focus();
        }
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); if (isMobileSidebar()) openSidebar(); else toggleSidebar(); }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); startNewConversation(); }
    });
    document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
    escucharGlobal(window, 'resize', () => {
        setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1', false);
        resizeInput();
    });
    escucharGlobal(window, 'orion:model-change', resizeInput);

    // Conversación nativa de audio a audio con Gemini Live. El puente React
    // encapsula el SDK; este script conserva el historial y la interfaz legacy.
    if (window.VNGeminiLive?.isSupported?.() && els.send) {
        const micBtn = document.createElement('button');
        micBtn.type = 'button';
        micBtn.id = 'vaiMic';
        micBtn.className = 'vai-mic-btn';
        micBtn.innerHTML = assistantFaceMarkup();
        micBtn.title = 'Iniciar conversación de voz con ORION';
        micBtn.setAttribute('aria-label', 'Hablar con ORION');
        els.send.parentNode.insertBefore(micBtn, els.send);

        const setLiveState = (state, detail = '') => {
            if (!els.voiceOverlay) return;
            const labels = {
                connecting: 'Conectando con ORION…', listening: detail || 'ORION te escucha…',
                speaking: 'ORION está hablando…', ended: 'Llamada finalizada', error: detail || 'Error en la llamada',
            };
            els.voiceOverlay.hidden = state === 'ended';
            els.voiceOverlay.className = `vai-voice-overlay state-${state === 'connecting' ? 'thinking' : state}`;
            setFaceState(els.voiceOrb, state === 'connecting' ? 'thinking' : state);
            if (els.voiceStatus) els.voiceStatus.textContent = labels[state] || detail;
            micBtn.classList.toggle('listening', !['ended', 'error'].includes(state));
            micBtn.innerHTML = assistantFaceMarkup();
            micBtn.setAttribute('aria-label', !['ended', 'error'].includes(state) ? 'Terminar conversación de voz' : 'Hablar con ORION');
            if (state === 'ended') {
                continuousVoiceMode = false;
                if (els.voiceUserTranscript) els.voiceUserTranscript.textContent = '';
                if (els.voiceAiTranscript) els.voiceAiTranscript.textContent = '';
            }
        };

        const speakMissingLiveAudio = (text) => {
            if (!text || !window.speechSynthesis) return;
            const utterance = new SpeechSynthesisUtterance(text.replace(/[#*`_]/g, ''));
            utterance.lang = 'es-MX';
            utterance.rate = .98;
            utterance.pitch = 1;
            const spanishVoices = window.speechSynthesis.getVoices().filter(voice => /^es(?:-|_)/i.test(voice.lang));
            utterance.voice = spanishVoices.find(voice => /natural|online|google/i.test(voice.name)) || spanishVoices[0] || null;
            utterance.onstart = () => {
                setLiveState('speaking');
                setFaceExpression(els.voiceOrb, expressionForText(text));
            };
            utterance.onboundary = event => cueFaceBoundary(els.voiceOrb, text, event);
            utterance.onend = () => { if (continuousVoiceMode) setLiveState('listening'); };
            window.speechSynthesis.speak(utterance);
        };

        const saveLiveTurn = ({ userText, modelText, audioMissing = false }) => {
            if (!session.current || (!userText && !modelText)) return;
            const conversation = ensureConversation();
            els.welcome.hidden = true;
            if (els.welcome.parentNode === els.messages) els.welcome.remove();
            if (userText) {
                const message = { role: 'user', text: userText, ts: Date.now(), source: 'voice-live' };
                conversation.messages.push(message);
                appendMessage(message);
            }
            if (modelText) {
                const message = { role: 'model', text: modelText, ts: Date.now(), source: 'voice-live' };
                conversation.messages.push(message);
                appendMessage(message);
            }
            persistConversation(conversation);
            // La llamada de voz recibe y responde por Gemini Live; enviamos la
            // transcripción al servidor para que también quede en la auditoría
            // privada de ORION, sin bloquear la conversación en curso.
            if (userText) {
                fetch('/api/orion-live-turn', {
                    method: 'POST', credentials: 'include', keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userText, response: modelText || '', conversationId: conversation.id }),
                }).catch(() => {});
            }
            renderHistory();
            els.messages.scrollTop = els.messages.scrollHeight;
            // Respaldo para respuestas ocasionales en las que Live entrega la
            // transcripción pero omite el paquete de audio.
            if (audioMissing) speakMissingLiveAudio(modelText);
        };

        const endLiveVoice = async () => {
            liveVoiceStart += 1;
            const current = liveVoiceController;
            liveVoiceController = null;
            continuousVoiceMode = false;
            legacyVoiceStop?.();
            await current?.stop?.();
            setLiveState('ended');
        };

        const startLiveVoice = async () => {
            const attempt = ++liveVoiceStart;
            continuousVoiceMode = true;
            setLiveState('connecting');
            try {
                const instance = await window.VNGeminiLive.start({
                    onState: setLiveState,
                    onLevel: level => {
                        if (els.voiceOrb && els.voiceOverlay?.classList.contains('state-listening')) {
                            els.voiceOrb.style.transform = `scale(${1 + level * .65})`;
                        }
                    },
                    onInputTranscript: text => {
                        if (els.voiceUserTranscript) els.voiceUserTranscript.textContent = text ? `Tú: ${text}` : '';
                    },
                    onOutputTranscript: text => {
                        if (els.voiceAiTranscript) els.voiceAiTranscript.textContent = text ? `ORION: ${text}` : '';
                        if (text) {
                            setFaceExpression(els.voiceOrb, expressionForText(text));
                            cueFaceSyllable(els.voiceOrb, 150);
                        }
                    },
                    onTurnComplete: saveLiveTurn,
                    onError: message => {
                        console.error('Gemini Live:', message);
                        setLiveState('error', message);
                    },
                });
                if (attempt !== liveVoiceStart || !continuousVoiceMode) return instance.stop();
                liveVoiceController = instance;
            } catch (error) {
                console.warn('Gemini Live no disponible; usando modo de voz compatible:', error.message);
                if (attempt !== liveVoiceStart || !continuousVoiceMode) return;
                if (els.voiceStatus) els.voiceStatus.textContent = 'Modo compatible: te escucho…';
                if (legacyVoiceStart) legacyVoiceStart();
                else {
                    setLiveState('error', error.message);
                    setTimeout(endLiveVoice, 2200);
                }
            }
        };

        els.voiceHangup?.addEventListener('click', endLiveVoice);
        micBtn.addEventListener('click', () => {
            if (continuousVoiceMode) endLiveVoice();
            else startLiveVoice();
        });
    }

    // Respaldo por SpeechRecognition + speechSynthesis cuando Live no puede
    // abrirse o el navegador no ofrece el audio nativo requerido.
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && els.send) {
        const micBtn = $('vaiMic') || document.createElement('button');
        if (!micBtn.id) {
            micBtn.type = 'button';
            micBtn.id = 'vaiMic';
            micBtn.className = 'vai-mic-btn';
            micBtn.innerHTML = assistantFaceMarkup();
            micBtn.title = "Hablar con ORION (modo compatible)";
            micBtn.setAttribute('aria-label', 'Hablar con ORION');
            els.send.parentNode.insertBefore(micBtn, els.send);
        }
        
        let recognition = null;
        let audioContext = null;
        let vadTimer = null;
        let isSpeaking = false;
        let localStream = null;
        let animationFrame = null;
        let finalTranscript = '';

        const stopRecording = () => {
            if (recognition) {
                try { recognition.stop(); } catch(e) {}
            }
            if (audioContext) { audioContext.close().catch(()=>{}); audioContext = null; }
            if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
            clearTimeout(vadTimer);
            cancelAnimationFrame(animationFrame);
            isSpeaking = false;
            micBtn.classList.remove('listening');
            micBtn.innerHTML = assistantFaceMarkup();
            micBtn.setAttribute('aria-label', 'Hablar con ORION');
            if (els.voiceOrb) els.voiceOrb.style.transform = 'scale(1)';
            if (els.voiceOverlay && continuousVoiceMode) {
                els.voiceOverlay.className = 'vai-voice-overlay state-thinking';
                setFaceState(els.voiceOrb, 'thinking');
                if (els.voiceStatus) els.voiceStatus.textContent = 'Pensando...';
            }
        };

        const startRecording = async () => {
            try {
                const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRec) {
                    window.alert('Tu navegador no soporta el reconocimiento de voz en vivo. Usa Google Chrome o Edge.');
                    continuousVoiceMode = false;
                    return;
                }

                recognition = new SpeechRec();
                recognition.lang = 'es-MX';
                recognition.continuous = true;
                recognition.interimResults = true;
                finalTranscript = '';

                recognition.onresult = (event) => {
                    let interimTranscript = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }
                    els.input.value = finalTranscript + interimTranscript;
                };

                recognition.onerror = (event) => {
                    console.error('SpeechRecognition error:', event.error);
                };

                recognition.onend = () => {
                    if (continuousVoiceMode) {
                        if (els.input.value.trim()) {
                            stopRecording(); // Cleanup UI and VAD before submitting
                            els.form.requestSubmit();
                        } else {
                            // If they said nothing (e.g. background noise triggered VAD), just restart listening
                            if (els.voiceOverlay) {
                                els.voiceOverlay.className = 'vai-voice-overlay state-listening';
                                setFaceState(els.voiceOrb, 'listening');
                                if (els.voiceStatus) els.voiceStatus.textContent = 'Escuchando...';
                            }
                            try { recognition.start(); } catch(e) {}
                        }
                    }
                };

                recognition.start();

                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                micBtn.classList.add('listening');
                micBtn.innerHTML = '<i class="fas fa-phone-slash"></i><span>Terminar</span>';
                micBtn.setAttribute('aria-label', 'Terminar conversación de voz');
                
                if (els.voiceOverlay) {
                    els.voiceOverlay.hidden = false;
                    els.voiceOverlay.className = 'vai-voice-overlay state-listening';
                    setFaceState(els.voiceOrb, 'listening');
                    if (els.voiceStatus) els.voiceStatus.textContent = 'Escuchando...';
                }

                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    audioContext = new AudioCtx();
                    const analyser = audioContext.createAnalyser();
                    analyser.minDecibels = -50;
                    const microphone = audioContext.createMediaStreamSource(localStream);
                    microphone.connect(analyser);

                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    const checkAudio = () => {
                        if (!localStream) return;
                        analyser.getByteFrequencyData(dataArray);
                        const maxVol = Math.max(...dataArray);
                        
                        if (els.voiceOrb && els.voiceOverlay.classList.contains('state-listening')) {
                            const scale = 1 + (maxVol / 255) * 1.5;
                            els.voiceOrb.style.transform = `scale(${scale})`;
                        }

                        if (maxVol > 30) {
                            if (!isSpeaking) isSpeaking = true;
                            clearTimeout(vadTimer);
                            vadTimer = setTimeout(() => {
                                if (isSpeaking) {
                                    isSpeaking = false;
                                    stopRecording(); // Automáticamente envía rápido
                                }
                            }, 1200); // 1.2 segundos de silencio antes de cortar
                        }
                        animationFrame = requestAnimationFrame(checkAudio);
                    };
                    checkAudio();
                }
            } catch (error) {
                window.alert('No se pudo acceder al micrófono para hablar con ORION.');
                continuousVoiceMode = false;
                stopRecording();
                if (els.voiceOverlay) els.voiceOverlay.hidden = true;
                setFaceState(els.voiceOrb, 'idle');
            }
        };

        autoListenCallback = () => {
            if (continuousVoiceMode && !localStream) {
                startRecording();
            }
        };
        legacyVoiceStart = startRecording;
        legacyVoiceStop = stopRecording;

        if (!window.VNGeminiLive?.isSupported?.() && els.voiceHangup) {
            els.voiceHangup.addEventListener('click', () => {
                continuousVoiceMode = false;
                stopRecording();
                if (els.voiceOverlay) els.voiceOverlay.hidden = true;
                setFaceState(els.voiceOrb, 'idle');
                if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
            });
        }

        if (!window.VNGeminiLive?.isSupported?.()) {
            micBtn.addEventListener('click', () => {
                if (continuousVoiceMode) {
                    continuousVoiceMode = false;
                    stopRecording();
                    if (els.voiceOverlay) els.voiceOverlay.hidden = true;
                    setFaceState(els.voiceOrb, 'idle');
                    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
                } else {
                    continuousVoiceMode = true;
                    startRecording();
                }
            });
        }
    }

    /* Corta todo lo que sobreviviría al cambio de página en la SPA: listeners
       globales, la petición en vuelo, el temporizador del reporte, el micrófono
       y la voz. Sin esto, salir de /vall-ai en mitad de una respuesta dejaba el
       fetch corriendo y al sintetizador hablando en otra sección. */
    function desmontar() {
        _globales.splice(0).forEach((quitar) => quitar());
        try { controller?.abort(); } catch { /* ya terminó */ }
        controller = null;
        clearTimeout(reportRenderTimer);
        clearTimeout(exportFeedbackTimer);
        liveVoiceStart += 1;
        continuousVoiceMode = false;
        try { liveVoiceController?.stop?.(); } catch { /* ya terminó */ }
        liveVoiceController = null;
        try { legacyVoiceStop?.(); } catch { /* ya terminó */ }
        try { if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel(); } catch { /* sin voz */ }
        pendingFiles.splice(0).forEach(item => { try { URL.revokeObjectURL(item.url); } catch {} });
        if (els.form) delete els.form.dataset.orionSending;
        if (window.VNVallAi?.desmontar === desmontar) delete window.VNVallAi;
    }

    function applyReportHandoffIfPresent() {
        const params = new URLSearchParams(window.location.search || '');
        const hasQueryFlag = params.get('from') === 'report';
        const handoff = typeof window.VNConsumeOrionHandoff === 'function' ? window.VNConsumeOrionHandoff() : null;
        if (hasQueryFlag) {
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('from');
                window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
            } catch {}
        }
        if (!handoff) return;
        startNewConversation();
        if (handoff.markdown && typeof File !== 'undefined') {
            const file = new File([handoff.markdown], handoff.fileName || 'contexto-informe.md', { type: 'text/markdown' });
            addFiles([file]);
        }
        if (handoff.prompt && els.input) {
            els.input.value = handoff.prompt;
            resizeInput();
            if (!busy) setConversationFaceState('listening');
            els.input.focus();
            els.input.setSelectionRange(els.input.value.length, els.input.value.length);
        }
    }

    window.VNVallAi = { desmontar };
    escucharGlobal(session.signal,'abort',()=>{desmontar();els.messages?.replaceChildren();els.history?.replaceChildren();if(els.input)els.input.value='';});

    if (!activeConversation() && conversations.length) activeId = conversations[0].id;
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1', false);
    renderConversation(); renderHistory(); resizeInput();
    applyReportHandoffIfPresent();
    syncProfileConversations();
})();
