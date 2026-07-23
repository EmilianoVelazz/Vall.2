(function () {
    'use strict';

    const CONV_KEY = 'vn_chat_conversations_v1';
    const ACTIVE_KEY = 'vn_chat_active_id_v1';
    const SIDEBAR_KEY = 'vn_ai_sidebar_collapsed';
    const MAX_CONVERSATIONS = 40;
    const MAX_MESSAGES = 40;

    const $ = (id) => document.getElementById(id);
    const els = {
        shell: document.querySelector('.vai-shell'), sidebar: $('vaiSidebar'), sidebarCollapse: $('vaiSidebarCollapse'), overlay: $('vaiOverlay'), sideClose: $('vaiSideClose'), historyToggle: $('vaiHistoryToggle'),
        history: $('vaiHistory'), historySearch: $('vaiHistorySearch'), historyCount: $('vaiHistoryCount'), newChat: $('vaiNew'),
        title: $('vaiConversationTitle'), remove: $('vaiDelete'), autoRoute: $('vaiAutoRoute'), messages: $('vaiMessages'), welcome: $('vaiWelcome'),
        form: $('vaiForm'), input: $('vaiInput'), send: $('vaiSend'), stop: $('vaiStop'),
        attach: $('vaiAttach'), fileInput: $('vaiFileInput'), attachments: $('vaiAttachments'), dropzone: $('vaiDropzone'),
        reportOpen: $('vaiReportOpen'), reportStudio: $('vaiReportStudio'), reportTitle: $('vaiReportTitle'), reportScope: $('vaiReportScope'),
        reportFormat: $('vaiReportFormat'), reportZoom: $('vaiReportZoom'), reportEditor: $('vaiReportEditor'), reportSource: $('vaiReportSource'), reportPreview: $('vaiReportPreview'),
        reportRefresh: $('vaiReportRefresh'), reportExport: $('vaiReportExport'), reportWords: $('vaiReportWords'), reportStatus: $('vaiReportStatus'),
        reportSave: $('vaiReportSave'), reportBody: document.querySelector('.vai-report-body'),
        voiceOverlay: $('vaiVoiceOverlay'), voiceOrb: $('vaiVoiceOrb'), voiceStatus: $('vaiVoiceStatus'), voiceHangup: $('vaiVoiceHangup')
    };

    let conversations = loadConversations();
    let activeId = localStorage.getItem(ACTIVE_KEY) || '';
    let busy = false;
    let controller = null;
    let continuousVoiceMode = false;
    let autoListenCallback = null;
    let mermaidReady = null;
    let reportRenderTimer = null;
    let activeReportContext = { key: 'latest', title: 'Reporte VALL AI', content: '', label: 'Última respuesta seleccionada' };
    let pendingFiles = [];
    const chartInstances = new WeakMap();

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
    }

    function loadConversations() {
        try {
            const value = JSON.parse(localStorage.getItem(CONV_KEY) || '[]');
            return Array.isArray(value) ? value.filter((item) => item && item.id && Array.isArray(item.messages)) : [];
        } catch { return []; }
    }

    function saveConversations() {
        conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        conversations = conversations.slice(0, MAX_CONVERSATIONS);
        localStorage.setItem(CONV_KEY, JSON.stringify(conversations));
    }

    function newId() { return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
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
        conversation.title = conversationTitle(conversation.messages);
        conversation.updatedAt = Date.now();
        conversation.messages = conversation.messages.slice(-MAX_MESSAGES);
        const index = conversations.findIndex((item) => item.id === conversation.id);
        if (index < 0) conversations.unshift(conversation); else conversations[index] = conversation;
        activeId = conversation.id;
        localStorage.setItem(ACTIVE_KEY, activeId);
        saveConversations();
        renderHistory();
        els.title.textContent = conversation.title;
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp || Date.now());
        const diff = Date.now() - date.getTime();
        if (diff < 86400000 && date.getDate() === new Date().getDate()) return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        if (diff < 604800000) return date.toLocaleDateString('es-MX', { weekday: 'short' });
        return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    }

    function renderHistory() {
        const query = els.historySearch.value.trim().toLowerCase();
        const visible = conversations.filter((item) => !query || item.title.toLowerCase().includes(query) || item.messages.some((message) => String(message.text || '').toLowerCase().includes(query)));
        els.historyCount.textContent = String(visible.length);
        els.history.replaceChildren();
        if (!visible.length) {
            const empty = document.createElement('div');
            empty.className = 'vai-history-empty';
            empty.innerHTML = query ? '<i class="fas fa-magnifying-glass"></i><br>No se encontraron conversaciones.' : '<i class="far fa-message"></i><br>Tu historial aparecerá aquí después de la primera pregunta.';
            els.history.appendChild(empty);
            return;
        }
        visible.forEach((conversation) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'vai-history-item' + (conversation.id === activeId ? ' active' : '');
            row.dataset.id = conversation.id;
            row.title = conversation.title;
            row.innerHTML = `<span class="vai-history-icon"><i class="far fa-message"></i></span><span class="vai-history-copy"><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(formatDate(conversation.updatedAt))}</small></span><span class="vai-history-remove" role="button" aria-label="Eliminar"><i class="fas fa-xmark"></i></span>`;
            row.addEventListener('click', (event) => {
                if (event.target.closest('.vai-history-remove')) { event.stopPropagation(); deleteConversation(conversation.id); return; }
                activeId = conversation.id;
                localStorage.setItem(ACTIVE_KEY, activeId);
                renderConversation();
                renderHistory();
                closeSidebar();
            });
            els.history.appendChild(row);
        });
    }

    function deleteConversation(id) {
        conversations = conversations.filter((item) => item.id !== id);
        saveConversations();
        if (id === activeId) startNewConversation();
        else renderHistory();
    }

    function startNewConversation() {
        if (busy) return;
        activeId = newId();
        localStorage.setItem(ACTIVE_KEY, activeId);
        renderConversation();
        renderHistory();
        closeSidebar();
        els.input.focus();
    }

    function markdown(value) {
        let text = escapeHtml(value || '');
        const codeBlocks = [];
        text = text.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, language, code) => {
            const index = codeBlocks.push(`<pre><code data-language="${escapeHtml(language || 'text')}">${code}</code></pre>`) - 1;
            return `\n@@VAI_CODE_${index}@@\n`;
        });
        text = text
            .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
            .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^#\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^&gt;\s?(.+)$/gm, '<div class="vai-quote">$1</div>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
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
                html += `<div style="overflow-x:auto"><table><thead><tr>${headers.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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

    function renderRich(container, response, fallback) {
        if (!response || !Array.isArray(response.blocks) || !response.blocks.length) {
            renderLegacyContent(container, fallback);
            return;
        }
        container.replaceChildren();
        response.blocks.forEach((block) => {
            let node;
            if (block.type === 'heading') {
                node = document.createElement(block.level >= 4 ? 'h4' : block.level === 3 ? 'h3' : 'h2');
                node.textContent = block.content;
            } else if (block.type === 'text' || block.type === 'markdown') {
                node = document.createElement('div'); node.innerHTML = markdown(block.content);
            } else if (block.type === 'code') {
                node = document.createElement('pre'); const code = document.createElement('code'); code.textContent = block.content; node.appendChild(code);
            } else if (block.type === 'table') {
                node = document.createElement('div'); node.style.overflowX = 'auto';
                const table = document.createElement('table');
                const head = document.createElement('tr'); (block.headers || []).forEach((value) => { const th = document.createElement('th'); th.textContent = value; head.appendChild(th); });
                const thead = document.createElement('thead'); thead.appendChild(head); table.appendChild(thead);
                const tbody = document.createElement('tbody'); (block.rows || []).forEach((row) => { const tr = document.createElement('tr'); row.forEach((value) => { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }); tbody.appendChild(tr); });
                table.appendChild(tbody); node.appendChild(table);
            } else if (block.type === 'alert') {
                node = document.createElement('div'); node.className = 'vai-alert'; node.innerHTML = `${block.title ? `<strong>${escapeHtml(block.title)}</strong>` : ''}${markdown(block.content)}`;
            } else if (block.type === 'quote') {
                node = document.createElement('div'); node.className = 'vai-quote'; node.textContent = block.content;
            } else if (block.type === 'steps' || block.type === 'checklist') {
                node = document.createElement(block.type === 'steps' ? 'ol' : 'ul'); (block.items || []).forEach((item) => { const li = document.createElement('li'); li.textContent = (block.type === 'checklist' ? (item.checked ? '✓ ' : '○ ') : '') + item.text; node.appendChild(li); });
            } else if (block.type === 'diagram') {
                node = document.createElement('div'); node.className = 'mermaid'; node.textContent = block.content; hydrateMermaid(node);
            } else if (block.type === 'chart') {
                node = createAdvancedChart(block.spec || {});
            } else if (block.type === 'formula') {
                node = document.createElement('pre'); node.textContent = block.content;
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
        } catch { node.classList.remove('mermaid'); node.innerHTML = `<pre><code>${escapeHtml(node.textContent)}</code></pre>`; }
    }

    function normalizeChartSpec(raw) {
        const allowed = new Set(['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea']);
        const views = new Set(['bar', 'horizontalBar', 'stackedBar', 'line', 'area', 'mixed', 'pie', 'doughnut', 'radar', 'polarArea']);
        const source = raw && typeof raw === 'object' ? raw : {};
        const sourceLabels = Array.isArray(source.labels) ? source.labels : (source.data && Array.isArray(source.data.labels) ? source.data.labels : []);
        const sourceDatasets = Array.isArray(source.datasets) ? source.datasets : (source.data && Array.isArray(source.data.datasets) ? source.data.datasets : []);
        
        const labels = sourceLabels.slice(0, 36).map((value) => String(value).slice(0, 60));
        const datasets = sourceDatasets.slice(0, 8).map((dataset, index) => ({
            label: String(dataset?.label || `Serie ${index + 1}`).slice(0, 80),
            type: allowed.has(dataset?.type) ? dataset.type : undefined,
            data: Array.isArray(dataset?.data) ? dataset.data.slice(0, labels.length || 36).map((value) => Number.isFinite(Number(value)) ? Number(value) : null) : [],
        })).filter((dataset) => dataset.data.length);
        return {
            type: allowed.has(source.type) ? source.type : 'bar', title: String(source.title || 'Visualización de datos').slice(0, 140),
            view: views.has(source.view) ? source.view : (allowed.has(source.type) ? source.type : 'bar'),
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
            const item = document.createElement('div'); item.innerHTML = `<small>${escapeHtml(dataset.label)}</small><strong>${escapeHtml(formatChartValue(latest, spec.unit))}</strong><small>Prom. ${escapeHtml(formatChartValue(avg, spec.unit))}${delta != null ? ` · Δ ${delta > 0 ? '+' : ''}${escapeHtml(formatChartValue(delta, spec.unit))}` : ''}</small>`; kpis.appendChild(item);
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
                        legend: { display: current.datasets.length > 1 || ['doughnut', 'radar'].includes(type), position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { family: 'Inter', size: 10 }, color: '#42596b' } },
                        tooltip: { backgroundColor: '#071a2b', titleFont: { family: 'Inter', weight: '700' }, bodyFont: { family: 'Inter' }, padding: 11, cornerRadius: 8, callbacks: { label: (ctx) => ` ${ctx.dataset.label || ''}: ${formatChartValue(ctx.raw, spec.unit)}` } },
                    },
                    scales: ['doughnut', 'pie', 'radar', 'polarArea'].includes(type) ? {} : {
                        x: { stacked: current.stacked, grid: { display: false }, ticks: { color: '#6c7e8c', font: { family: 'Inter', size: 10 } } },
                        y: { stacked: current.stacked, beginAtZero: current.beginAtZero, grid: { color: 'rgba(11,47,77,.07)' }, ticks: { color: '#6c7e8c', font: { family: 'Inter', size: 10 }, callback: (value) => formatChartValue(value, spec.unit) } },
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
            card.dataset.chartSpec = JSON.stringify(spec);
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
        return String(value || 'reporte-vall-ai').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'reporte-vall-ai';
    }

    function appendMessage(message, options = {}) {
        const row = document.createElement('article');
        row.className = 'vai-message ' + (message.role === 'user' ? 'user' : 'assistant');
        const avatar = document.createElement('div'); avatar.className = 'vai-avatar';
        avatar.innerHTML = message.role === 'user' ? '<i class="fas fa-user"></i>' : '<img src="/assets/img/mascota1.png" alt="VALL AI">';
        const bubble = document.createElement('div'); bubble.className = 'vai-bubble';
        if (options.thinking) bubble.innerHTML = '<span class="vai-thinking">Analizando <i></i><i></i><i></i></span>';
        else renderRich(bubble, message.rich, message.text || '');
        decorateMessage(bubble, message, options);
        if (!options.thinking && Array.isArray(message.attachments) && message.attachments.length) {
            const files = document.createElement('div'); files.className = 'vai-message-files';
            message.attachments.forEach((file) => {
                const chip = document.createElement('span');
                const icon = String(file.type).startsWith('image/') ? 'fa-image' : file.type === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-lines';
                chip.innerHTML = `<i class="fas ${icon}"></i>${escapeHtml(file.name)}`;
                files.appendChild(chip);
            });
            bubble.appendChild(files);
        }
        if (!options.thinking && message.role !== 'user' && message.text) attachReportActions(bubble, message);
        row.append(avatar, bubble); els.messages.appendChild(row);
        return { row, bubble };
    }

    function decorateMessage(bubble, message, options = {}) {
        if (bubble.querySelector(':scope > .vai-message-meta')) return;
        const meta = document.createElement('div'); meta.className = 'vai-message-meta';
        const label = message.role === 'user' ? 'Tú' : 'VALL AI';
        const time = new Date(message.ts || Date.now()).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        meta.innerHTML = `<span><i class="fas ${message.role === 'user' ? 'fa-user' : 'fa-wand-magic-sparkles'}"></i>${label}</span><small>${options.thinking ? 'Preparando análisis' : time}</small>`;
        bubble.prepend(meta);
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

    function attachReportActions(bubble, message) {
        if (bubble.querySelector('.vai-response-actions')) return;
        const actions = document.createElement('div'); actions.className = 'vai-response-actions';
        let html = '<button type="button" data-edit-report><i class="fas fa-file-pen"></i> Vista previa y exportar</button><button type="button" data-quick-word><i class="fas fa-file-word"></i> Word directo</button>';
        
        if (message.queryId) {
            html += `<span class="vai-feedback-group" style="margin-left:auto; display:flex; gap:0.25rem;">
                <button type="button" data-speak title="Leer en voz alta"><i class="fas fa-volume-up"></i></button>
                <button type="button" data-feedback="up" title="Útil"><i class="fas fa-thumbs-up"></i></button>
                <button type="button" data-feedback="down" title="No útil"><i class="fas fa-thumbs-down"></i></button>
                <button type="button" data-feedback="correct" title="Enseñar/Corregir" class="vai-btn-correct"><i class="fas fa-pen-to-square"></i> Corregir</button>
            </span>`;
        }
        
        actions.innerHTML = html;
        actions.querySelector('[data-edit-report]').addEventListener('click', () => openReportStudio(message));
        actions.querySelector('[data-quick-word]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                const report = reportContextFor(message);
                await requestServerExport(report.title, report.content, 'docx', bubble);
            } finally { btn.disabled = false; }
        });
        
        if (message.queryId) {
            const speakBtn = actions.querySelector('[data-speak]');
            speakBtn?.addEventListener('click', () => {
                if (window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                    speakBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                } else {
                    const utterance = new SpeechSynthesisUtterance(message.text.replace(/[#*`_]/g, ''));
                    utterance.lang = 'es-MX';
                    utterance.onend = () => {
                        speakBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        if (continuousVoiceMode && autoListenCallback) setTimeout(autoListenCallback, 200);
                    };
                    speakBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                    window.speechSynthesis.speak(utterance);
                }
            });
            actions.querySelectorAll('[data-feedback]').forEach(btn => {
                btn.addEventListener('click', (e) => handleFeedback(message.queryId, e.currentTarget.dataset.feedback, e.currentTarget));
            });
        }
        
        bubble.appendChild(actions);
    }

    function renderConversation() {
        els.messages.replaceChildren();
        const conversation = activeConversation();
        const messages = conversation?.messages?.filter((message) => !message._hidden) || [];
        els.title.textContent = conversation?.title || 'Nueva conversación';
        if (!messages.length) {
            els.messages.appendChild(els.welcome);
            els.welcome.hidden = false;
        } else {
            els.welcome.hidden = true;
            let lastQuestion = '', upgraded = false;
            messages.forEach((message) => {
                if (message.role === 'user') lastQuestion = message.text || '';
                else if (lastQuestion) {
                    if (sanitizeLegacyChartMessage(message, lastQuestion)) upgraded = true;
                    const before = message.text;
                    const enriched = guaranteeRequestedChart({ text: message.text || '', rich: message.rich || null }, lastQuestion);
                    message.text = enriched.text; message.rich = enriched.rich;
                    if (message.text !== before) upgraded = true;
                }
                appendMessage(message);
            });
            if (upgraded && conversation) persistConversation(conversation);
        }
        requestAnimationFrame(() => { els.messages.scrollTop = els.messages.scrollHeight; });
    }

    function setBusy(value) {
        busy = value; els.send.disabled = value; els.input.disabled = value; els.attach.disabled = value; els.stop.hidden = !value;
        els.autoRoute.classList.toggle('routing', value);
        if (value) { els.autoRoute.querySelector('small').textContent = 'Analizando intención'; els.autoRoute.querySelector('b').textContent = 'Eligiendo modelo…'; }
    }

    function updateAdaptiveRoute(route) {
        const modes = { quick: 'Respuesta rápida', normal: 'Análisis equilibrado', detailed: 'Análisis profundo', technical: 'Razonamiento técnico', executive: 'Síntesis ejecutiva' };
        els.autoRoute.querySelector('small').textContent = modes[route?.mode] || 'Selección automática';
        els.autoRoute.querySelector('b').textContent = route?.tier === 'pro' ? 'Gemini Pro' : route?.tier === 'flash' ? 'Gemini Flash' : 'Modelo adaptativo';
    }

    async function streamAnswer(message, history, attachmentIds, onText, apiContext = '', historicalChart = null) {
        controller = new AbortController();
        const historicalContext = historicalChart
            ? `\n[SERIE HISTÓRICA VERIFICADA PARA LA GRÁFICA]\n${JSON.stringify(historicalChart)}\nUsa exactamente estos datos para generar el bloque chart solicitado.\n[FIN SERIE HISTÓRICA]`
            : '';
        const payload = {
            message,
            prompt: message,
            history,
            attachmentIds,
            context: ['Página dedicada VALL AI de VALLNews.', apiContext, historicalContext].filter(Boolean).join('\n\n'),
            mode: 'auto',
            structured: true,
        };
        const response = await fetch('/api/ai-insight-stream', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (!response.ok || !response.body) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `No fue posible consultar VALL AI (${response.status}).`);
        }
        const reader = response.body.getReader(); const decoder = new TextDecoder();
        let buffer = '', full = '', rich = null, route = null;
        while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let split;
            while ((split = buffer.indexOf('\n\n')) >= 0) {
                const event = buffer.slice(0, split); buffer = buffer.slice(split + 2);
                const line = event.split('\n').find((item) => item.startsWith('data:')); if (!line) continue;
                let data; try { data = JSON.parse(line.slice(5).trim()); } catch { continue; }
                if (data.error) throw new Error(data.error);
                if (data.text) { full += data.text; onText(full); }
                if (data.response) rich = data.response;
                if (data.done) {
                    if (data.finalText) full = data.finalText;
                    route = { tier: data.tier, mode: data.mode, model: data.model, queryId: data.queryId };
                }
            }
        }
        if (!full && rich?.markdown) full = rich.markdown;
        if (!full) throw new Error('VALL AI no devolvió contenido. Intenta formular la pregunta nuevamente.');
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

    function normalizedFileType(file) {
        if (file.type) return file.type.toLowerCase().split(';')[0].trim();
        const extension = String(file.name).split('.').pop().toLowerCase();
        return ({ txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json', pdf: 'application/pdf' })[extension] || '';
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
            reader.readAsDataURL(file);
        });
    }

    function renderPendingFiles() {
        els.attachments.replaceChildren();
        els.attachments.hidden = !pendingFiles.length;
        pendingFiles.forEach((item, index) => {
            const card = document.createElement('div'); card.className = 'vai-attachment-card';
            if (item.type.startsWith('image/')) {
                const image = document.createElement('img'); image.src = item.url; image.alt = ''; card.appendChild(image);
            } else {
                const icon = document.createElement('i'); icon.className = `fas ${item.type === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-lines'}`; card.appendChild(icon);
            }
            const copy = document.createElement('span');
            copy.innerHTML = `<strong>${escapeHtml(item.file.name)}</strong><small>${(item.file.size / 1024).toFixed(item.file.size > 1024 * 1024 ? 0 : 1)} KB</small>`;
            const remove = document.createElement('button'); remove.type = 'button'; remove.setAttribute('aria-label', `Quitar ${item.file.name}`); remove.innerHTML = '<i class="fas fa-xmark"></i>';
            remove.addEventListener('click', () => { URL.revokeObjectURL(item.url); pendingFiles.splice(index, 1); renderPendingFiles(); });
            card.append(copy, remove); els.attachments.appendChild(card);
        });
    }

    function addFiles(fileList) {
        const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/json', 'audio/webm', 'audio/mp4', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/webm;codecs=opus']);
        const incoming = Array.from(fileList || []);
        for (const file of incoming) {
            const type = normalizedFileType(file);
            if (!allowed.has(type)) { window.alert(`${file.name}: tipo de archivo no compatible.`); continue; }
            if (file.size > 6 * 1024 * 1024) { window.alert(`${file.name}: el límite es 6 MB por archivo.`); continue; }
            if (pendingFiles.length >= 5) { window.alert('Puedes adjuntar hasta 5 archivos por mensaje.'); break; }
            pendingFiles.push({ file, type, url: URL.createObjectURL(file) });
        }
        renderPendingFiles();
    }

    async function uploadFiles(files) {
        const uploaded = [];
        for (const item of files) {
            const response = await fetch('/api/chat-attachments', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.file.name, type: item.type, dataUrl: await fileToDataUrl(item.file) }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.attachment?.id) throw new Error(data.error || `No se pudo subir ${item.file.name}.`);
            uploaded.push(data.attachment);
        }
        return uploaded;
    }

    async function sendMessage(text) {
        const clean = String(text || '').trim() || (pendingFiles.length ? (pendingFiles.some(f => String(f.type || '').startsWith('audio/')) ? 'Escucha este mensaje de voz y responde a mi consulta.' : 'Analiza los archivos adjuntos y presenta los hallazgos principales.') : '');
        if (!clean || busy) return;
        
        const conversation = ensureConversation();
        const correctionKeywords = /te equivocaste|est(a|á) mal|est(a|á)s mal|no era lo que ped[ií]|eso no|no me refer[ií]a a|incorrecto|corr[ií]ge|corr[ií]gelo|as[ií] no|m[aá]l/i;
        if (correctionKeywords.test(clean)) {
            const previousAiMessage = conversation.messages.slice().reverse().find(m => m.role === 'model' && m.queryId);
            if (previousAiMessage) {
                // Auto-reportar que el usuario está corrigiendo el último mensaje
                handleFeedback(previousAiMessage.queryId, 'correct', null, clean);
            }
        }
        
        const fileSnapshot = pendingFiles.slice();
        setBusy(true);
        let uploaded = [];
        try { uploaded = await uploadFiles(fileSnapshot); }
        catch (error) { 
            setBusy(false); 
            window.alert(error.message); 
            if (continuousVoiceMode && els.voiceOverlay) {
                els.voiceOverlay.hidden = true;
                continuousVoiceMode = false;
            }
            return; 
        }
        fileSnapshot.forEach(item => URL.revokeObjectURL(item.url)); pendingFiles = []; renderPendingFiles();
        
        els.welcome.hidden = true; if (els.welcome.parentNode === els.messages) els.welcome.remove();
        const userMessage = { role: 'user', text: clean, attachments: uploaded.map(({ name, type, size }) => ({ name, type, size })), ts: Date.now() };
        conversation.messages.push(userMessage); appendMessage(userMessage);
        const recent = conversation.messages.filter((item) => !item._hidden).slice(-15, -1).map((item) => ({ role: item.role, content: String(item.text || '').slice(0, 2600) }));
        persistConversation(conversation); els.input.value = ''; resizeInput();
        const pending = appendMessage({ role: 'model', text: '' }, { thinking: true });
        els.messages.scrollTop = els.messages.scrollHeight;
        try {
            const [apiContext, historicalChart] = await Promise.all([
                typeof VDS !== 'undefined' && VDS.aiDataContext
                    ? VDS.aiDataContext(clean).catch(() => '')
                    : Promise.resolve(''),
                typeof VDS !== 'undefined' && VDS.historicalUsdMxnChartSpec
                    ? VDS.historicalUsdMxnChartSpec(clean).catch(() => null)
                    : Promise.resolve(null),
            ]);
            const result = guaranteeRequestedChart(
                await streamAnswer(clean, recent, uploaded.map(file => file.id), (partial) => {
                    pending.bubble.innerHTML = markdown(partial);
                    els.messages.scrollTop = els.messages.scrollHeight;
                }, apiContext, historicalChart),
                clean,
                historicalChart
            );
            updateAdaptiveRoute(result.route);
            renderRich(pending.bubble, result.rich, result.text);
            const modelMessage = { role: 'model', text: result.text, rich: result.rich, ts: Date.now(), queryId: result.route?.queryId };
            decorateMessage(pending.bubble, modelMessage);
            conversation.messages.push(modelMessage);
            persistConversation(conversation);
            attachReportActions(pending.bubble, modelMessage);
        } catch (error) {
            if (error.name === 'AbortError') pending.bubble.innerHTML = '<div class="vai-alert">Generación detenida.</div>';
            else pending.bubble.innerHTML = `<div class="vai-error"><strong>No pude completar la respuesta.</strong><br>${escapeHtml(error.message)}</div>`;
        } finally {
            controller = null; setBusy(false); els.input.focus(); els.messages.scrollTop = els.messages.scrollHeight;
            if (continuousVoiceMode) {
                if (window.speechSynthesis && !pending.bubble.querySelector('.vai-error')) {
                    if (els.voiceOverlay) {
                        els.voiceOverlay.className = 'vai-voice-overlay state-speaking';
                        if (els.voiceStatus) els.voiceStatus.textContent = 'Vall AI Hablando...';
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
                            continuousVoiceMode = false; 
                        }, 2000);
                    }
                }
            }
        }
    }

    function reportDraftKey() { return `vn_ai_report_draft_${activeId || 'new'}_${activeReportContext.key || 'latest'}`; }

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
        return /\b(reporte|informe|documento|exportar|exporta|word|pdf)\b/i.test(String(text || ''));
    }

    function reportTitleFrom(answer, question) {
        const headings = Array.from(String(answer || '').matchAll(/^#{1,4}\s+(.+)$/gm)).map(match => match[1].trim());
        const reportHeading = headings.find(value => /\b(reporte|informe|documento)\b/i.test(value));
        if (reportHeading) return reportHeading.slice(0, 110);
        if (headings[0]) return headings[0].slice(0, 110);
        const subject = String(question || '').replace(/^.*?\b(?:reporte|informe|documento)\b\s*(?:sobre|de)?\s*/i, '').replace(/[.?!]+$/g, '').trim();
        return (subject ? `Reporte: ${subject}` : activeConversation()?.title || 'Reporte VALL AI').slice(0, 110);
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
        const messages = activeConversation()?.messages?.filter(message => !message._hidden) || [];
        let modelIndex = -1;
        if (selectedMessage && !(selectedMessage instanceof Event)) {
            modelIndex = messages.findIndex(message => message === selectedMessage || (message.ts && message.ts === selectedMessage.ts && message.role === selectedMessage.role));
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
            return { key: 'manual', title: 'Reporte VALL AI', content: '# Reporte VALL AI\n\nEscribe aquí el contenido del reporte.', label: 'Documento manual' };
        }
        const isolated = isolateRequestedReport(model.text);
        const title = reportTitleFrom(isolated, user?.text);
        const heading = isolated.match(/^#{1,4}\s+(.+)\n*/);
        const body = heading && heading[1].trim().toLowerCase() === title.toLowerCase() ? isolated.slice(heading[0].length).trim() : isolated;
        const content = [`# ${title}`, '', `**Fecha:** ${new Date(model.ts || Date.now()).toLocaleString('es-MX')}`, '', body, '', '---', '', '*Documento informativo. Verifica las cifras relevantes antes de tomar decisiones.*'].join('\n').trim();
        return {
            key: `response_${model.ts || modelIndex}`,
            title,
            content,
            label: hasReportIntent(user?.text) ? 'Reporte solicitado detectado' : 'Respuesta seleccionada',
        };
    }

    function buildConversationReport() {
        const conversation = activeConversation();
        const messages = conversation?.messages?.filter((message) => !message._hidden) || [];
        const sections = [`# ${conversation?.title || 'Reporte VALL AI'}`, '', `**Fecha:** ${new Date().toLocaleString('es-MX')}`, '', '> Documento editable generado a partir de la conversación con VALL AI.', ''];
        let questionNumber = 0;
        messages.forEach((message) => {
            if (message.role === 'user') {
                questionNumber += 1;
                sections.push(`## Consulta ${questionNumber}`, '', message.text || '', '');
            } else if (message.role === 'model' || message.role === 'assistant') {
                sections.push(message.text || '', '');
            }
        });
        if (!messages.length) sections.push('## Resumen ejecutivo', '', 'Escribe aquí el contenido de tu reporte o genera primero un análisis con VALL AI.');
        sections.push('', '---', '', '*Documento informativo. Verifica las cifras relevantes antes de tomar decisiones.*');
        return sections.join('\n').trim();
    }

    function openReportStudio(selectedMessage = null) {
        activeReportContext = reportContextFor(selectedMessage);
        const saved = localStorage.getItem(reportDraftKey());
        els.reportTitle.value = activeReportContext.title;
        els.reportScope.innerHTML = `<i class="fas fa-crosshairs"></i> ${escapeHtml(activeReportContext.label)}`;
        setEditorMarkdown(saved || activeReportContext.content);
        els.reportStudio.hidden = false;
        document.body.style.overflow = 'hidden';
        setReportView(localStorage.getItem('vn_ai_report_view') || (window.innerWidth <= 760 ? 'preview' : 'split'));
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
        localStorage.setItem('vn_ai_report_view', selected);
        if (selected !== 'edit') renderReportPreview();
        if (selected === 'edit') setTimeout(() => els.reportEditor.focus(), 50);
    }

    function saveReportDraft() {
        localStorage.setItem(reportDraftKey(), reportContent());
        renderReportPreview();
        els.reportStatus.textContent = 'Borrador guardado';
    }

    function formatEditor(command, value = null) {
        els.reportEditor.focus();
        document.execCommand(command, false, value);
        els.reportEditor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function renderReportPreview() {
        const content = reportContent();
        localStorage.setItem(reportDraftKey(), content);
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        els.reportWords.textContent = `${words} palabras`;
        els.reportPreview.replaceChildren();
        const reportTitle = els.reportTitle.value.trim() || 'Reporte VALL AI';
        const masthead = document.createElement('header'); masthead.className = 'vai-paper-masthead';
        masthead.innerHTML = '<span>VALLNEWS</span><small>INTELIGENCIA ECONÓMICA</small><b>REPORTE DE ANÁLISIS</b>';
        const title = document.createElement('h1'); title.textContent = reportTitle;
        const meta = document.createElement('div'); meta.className = 'vai-paper-meta';
        meta.innerHTML = `<span><i class="fas fa-calendar"></i>${escapeHtml(new Date().toLocaleDateString('es-MX', { dateStyle: 'long' }))}</span><span><i class="fas fa-wand-magic-sparkles"></i>Preparado con VALL AI</span><span><i class="fas fa-file-lines"></i>${words} palabras</span>`;
        const cleanContent = content.replace(/^#\s+(.+)\n+/, (match, firstTitle) => firstTitle.trim().toLowerCase() === reportTitle.toLowerCase() ? '' : match);
        const body = document.createElement('div'); body.className = 'vai-paper-content'; renderLegacyContent(body, cleanContent);
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

    function reportHtmlDocument() {
        const title = escapeHtml(els.reportTitle.value.trim() || 'Reporte VALL AI');
        return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{max-width:820px;margin:40px auto;padding:0 28px;color:#1c2d3a;font:15px/1.65 Arial,sans-serif}body:before{content:'VALLNEWS · INTELIGENCIA ECONÓMICA';display:block;padding-bottom:12px;border-bottom:4px solid #0a2c45;color:#9a762d;font-size:11px;font-weight:700;letter-spacing:2px}h1,h2,h3{color:#0b2b44}h1{font-size:30px}h2{margin-top:28px;border-bottom:1px solid #dce4e9;padding-bottom:7px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #dbe3e8;text-align:left}th{background:#edf2f5}pre{white-space:pre-wrap;padding:14px;background:#071827;color:#e5eff5;border-radius:8px}.vai-chart-card{margin:18px 0;padding:14px;border:1px solid #dbe3e8;border-radius:12px}.vai-chart-kpis{display:flex;gap:8px;flex-wrap:wrap}.vai-chart-kpis div{padding:7px;border:1px solid #e2e8ed}.vai-chart-foot{font-size:11px;color:#71818d}</style></head><body>${previewHtmlWithChartImages()}</body></html>`;
    }

    function downloadBlob(filename, content, mime) {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function collectChartImages(container) {
        return Array.from(container?.querySelectorAll('canvas') || []).slice(0, 8).map(canvas => {
            try { return canvas.toDataURL('image/png', 1); } catch { return null; }
        }).filter(Boolean);
    }

    async function waitForRenderedCharts(container) {
        const cards = Array.from(container?.querySelectorAll('.vai-chart-card') || []);
        await Promise.all(cards.map(card => Promise.resolve(card._vaiChartReady).catch(() => null)));
        if (cards.length) {
            // Esperamos a que terminen las animaciones de Chart.js (650ms + margen)
            await new Promise(resolve => setTimeout(resolve, 850));
        }
    }

    async function requestServerExport(title, content, format, container) {
        await waitForRenderedCharts(container);
        const response = await fetch('/api/report-export', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, format, chartImages: collectChartImages(container) }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.downloadUrl) throw new Error(data.error || `No se pudo crear el archivo (${response.status}).`);
        const frame = document.createElement('iframe'); frame.hidden = true; frame.src = data.downloadUrl; document.body.appendChild(frame);
        setTimeout(() => frame.remove(), 30000);
        return data;
    }

    async function exportReport() {
        renderReportPreview();
        const title = els.reportTitle.value.trim() || 'Reporte VALL AI';
        const filename = sanitizeFilename(title);
        const content = reportContent();
        const format = els.reportFormat.value;
        els.reportExport.disabled = true; els.reportStatus.textContent = 'Preparando archivo…';
        try {
            const result = await requestServerExport(title, content, format, els.reportPreview);
            els.reportStatus.textContent = `Archivo listo: ${result.filename}`;
        } catch (error) {
            els.reportStatus.textContent = error.message || 'No se pudo exportar';
        } finally { els.reportExport.disabled = false; }
    }

    function resizeInput() { els.input.style.height = 'auto'; els.input.style.height = Math.min(els.input.scrollHeight, 160) + 'px'; }
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
        els.sidebarCollapse.setAttribute('aria-label', value ? 'Desplegar historial' : 'Contraer historial');
        els.sidebarCollapse.title = value ? 'Desplegar historial' : 'Contraer historial';
        els.sidebarCollapse.querySelector('i').className = `fas fa-chevron-${value ? 'right' : 'left'}`;
        els.historyToggle.setAttribute('aria-label', value ? 'Desplegar historial' : 'Abrir historial');
        if (persist) localStorage.setItem(SIDEBAR_KEY, value ? '1' : '0');
    }
    function toggleSidebar() { setSidebarCollapsed(!els.sidebar.classList.contains('collapsed')); }
    function openSidebar() {
        if (!isMobileSidebar()) { setSidebarCollapsed(false); return; }
        els.sidebar.classList.add('open'); els.overlay.classList.add('open');
    }
    function closeSidebar() { els.sidebar.classList.remove('open'); els.overlay.classList.remove('open'); }

    els.form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(els.input.value); });
    els.input.addEventListener('input', resizeInput);
    els.attach.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', () => { addFiles(els.fileInput.files); els.fileInput.value = ''; });
    els.input.addEventListener('paste', (event) => {
        const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
        if (files.length) addFiles(files);
    });
    ['dragenter', 'dragover'].forEach(type => els.form.addEventListener(type, (event) => { event.preventDefault(); els.dropzone.hidden = false; }));
    els.form.addEventListener('dragleave', (event) => { if (!els.form.contains(event.relatedTarget)) els.dropzone.hidden = true; });
    els.form.addEventListener('drop', (event) => { event.preventDefault(); els.dropzone.hidden = true; addFiles(event.dataTransfer?.files); });
    els.input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); els.form.requestSubmit(); } });
    els.historySearch.addEventListener('input', renderHistory);
    els.newChat.addEventListener('click', startNewConversation);
    els.remove.addEventListener('click', () => { if (activeConversation()) deleteConversation(activeId); else startNewConversation(); });
    els.stop.addEventListener('click', () => controller?.abort());
    els.historyToggle.addEventListener('click', openSidebar); els.sidebarCollapse.addEventListener('click', toggleSidebar); els.sideClose.addEventListener('click', closeSidebar); els.overlay.addEventListener('click', closeSidebar);
    els.reportOpen.addEventListener('click', () => openReportStudio());
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
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !els.reportStudio.hidden) closeReportStudio();
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); if (isMobileSidebar()) openSidebar(); else toggleSidebar(); }
    });
    document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.prompt)));
    window.addEventListener('resize', () => setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1', false));

    // Voice Input via Audio Attachment for Gemini
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && els.send) {
        const micBtn = document.createElement('button');
        micBtn.type = 'button';
        micBtn.id = 'vaiMic';
        micBtn.className = 'vai-mic-btn';
        micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        micBtn.title = "Hablar con VALL AI (Voz a Gemini)";
        els.send.parentNode.insertBefore(micBtn, els.send);
        
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
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            if (els.voiceOrb) els.voiceOrb.style.transform = 'scale(1)';
            if (els.voiceOverlay && continuousVoiceMode) {
                els.voiceOverlay.className = 'vai-voice-overlay state-thinking';
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

                recognition.onend = () => {
                    if (continuousVoiceMode) {
                        if (els.input.value.trim()) {
                            stopRecording(); // Cleanup UI and VAD before submitting
                            els.form.requestSubmit();
                        } else {
                            // If they said nothing, just restart listening
                            try { recognition.start(); } catch(e) {}
                        }
                    }
                };

                recognition.start();

                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                micBtn.classList.add('listening');
                micBtn.innerHTML = '<i class="fas fa-phone"></i>';
                
                if (els.voiceOverlay) {
                    els.voiceOverlay.hidden = false;
                    els.voiceOverlay.className = 'vai-voice-overlay state-listening';
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
                window.alert('No se pudo acceder al micrófono para hablar con VALL AI.');
                continuousVoiceMode = false;
                stopRecording();
                if (els.voiceOverlay) els.voiceOverlay.hidden = true;
            }
        };

        autoListenCallback = () => {
            if (continuousVoiceMode && !localStream) {
                startRecording();
            }
        };

        if (els.voiceHangup) {
            els.voiceHangup.addEventListener('click', () => {
                continuousVoiceMode = false;
                stopRecording();
                if (els.voiceOverlay) els.voiceOverlay.hidden = true;
                if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
            });
        }

        micBtn.addEventListener('click', () => {
            if (continuousVoiceMode) {
                continuousVoiceMode = false;
                stopRecording();
                if (els.voiceOverlay) els.voiceOverlay.hidden = true;
                if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
            } else {
                continuousVoiceMode = true;
                startRecording();
            }
        });
    }

    if (!activeConversation() && conversations.length) activeId = conversations[0].id;
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1', false);
    renderConversation(); renderHistory(); resizeInput();
})();
