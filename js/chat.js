document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');
    const chatBox = document.getElementById('chatBox');
    
    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        
        // Toggle send button
        if(this.value.trim().length > 0) {
            sendBtn.classList.add('active');
        } else {
            sendBtn.classList.remove('active');
        }
    });

    // Enter to send (without Shift)
    chatInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if(chatInput.value.trim().length > 0) {
                sendMessage();
            }
        }
    });

    sendBtn.addEventListener('click', () => {
        if(chatInput.value.trim().length > 0) {
            sendMessage();
        }
    });

    const DEFAULT_GREETING = chatBox.innerHTML;
    let currentSessionId = Date.now().toString();
    let historySessions = JSON.parse(localStorage.getItem('vn_fullchat_history') || '[]');
    const historyList = document.getElementById('historyList');
    const newChatBtn = document.getElementById('newChatBtn');

    function saveCurrentSession(title = null) {
        let session = historySessions.find(s => s.id === currentSessionId);
        if (!session) {
            session = { id: currentSessionId, title: title || 'Nueva Consulta', html: '' };
            historySessions.unshift(session);
        } else if (title) {
            session.title = title;
        }
        session.html = chatBox.innerHTML;
        historySessions = historySessions.slice(0, 20); // max 20
        localStorage.setItem('vn_fullchat_history', JSON.stringify(historySessions));
        renderHistory();
    }

    function renderHistory() {
        if (!historyList) return;
        historyList.innerHTML = '';
        historySessions.forEach(sess => {
            const div = document.createElement('div');
            div.className = 'history-item';
            if (sess.id === currentSessionId) {
                div.style.background = 'rgba(255,255,255,0.1)';
                div.style.borderLeft = '3px solid var(--clr-accent)';
            }
            div.innerHTML = `<i class="far fa-message"></i> ${escapeHtml(sess.title)}`;
            div.onclick = () => loadSession(sess.id);
            historyList.appendChild(div);
        });
    }

    function loadSession(id) {
        const session = historySessions.find(s => s.id === id);
        if (session) {
            currentSessionId = id;
            chatBox.innerHTML = session.html;
            scrollToBottom();
            renderHistory();
            bindSuggestButtons();
        }
    }
    
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            currentSessionId = Date.now().toString();
            chatBox.innerHTML = DEFAULT_GREETING;
            bindSuggestButtons();
            renderHistory();
        });
    }

    function bindSuggestButtons() {
        document.querySelectorAll('.suggest-btn').forEach(btn => {
            btn.onclick = (e) => {
                chatInput.value = e.target.innerText;
                sendBtn.classList.add('active');
                sendMessage();
                const grid = document.querySelector('.suggestions-grid');
                if(grid) grid.remove();
            };
        });
    }
    
    // Initial calls
    bindSuggestButtons();
    renderHistory();

    function sendMessage() {
        const text = chatInput.value.trim();
        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendBtn.classList.remove('active');
        
        const isFirstMessage = !historySessions.find(s => s.id === currentSessionId);
        appendUserMessage(text);
        
        if (isFirstMessage) {
            saveCurrentSession(text.length > 25 ? text.slice(0, 25) + '...' : text);
        } else {
            saveCurrentSession();
        }
        
        // Fake AI processing wait before triggering API
        setTimeout(() => {
            appendAIMessage(text);
        }, 100);
    }

    function appendUserMessage(text) {
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble user-msg';
        bubble.innerHTML = `
            <div class="msg-avatar"><i class="fas fa-user"></i></div>
            <div class="msg-content"><p>${escapeHtml(text)}</p></div>
        `;
        chatBox.appendChild(bubble);
        scrollToBottom();
    }

    function appendAIMessage(text) {
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble ai-msg';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content typing-indicator';
        
        bubble.innerHTML = `<div class="msg-avatar"><i class="fas fa-robot"></i></div>`;
        bubble.appendChild(contentDiv);
        chatBox.appendChild(bubble);
        scrollToBottom();


        // SYSTEM PROMPT
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
8. Firma tus análisis importantes como "— VALL-AI, Inteligencia Económica".
9. Si el usuario pide "un reporte", "documento" o "en Word", redacta la respuesta como
   un reporte formal y completo (título, secciones, conclusión) — el botón de descarga
   junto al mensaje generará el archivo .doc con ese contenido automáticamente.
10. GRÁFICAS — REGLA OBLIGATORIA: si el usuario pide una gráfica/gráfico/chart/
    visualización/diagrama (o pide un reporte "con gráficas"), tu ÚNICA forma válida de
    dibujarla es un bloque de código con lenguaje "chart" y SOLO JSON válido dentro, así:
    \`\`\`chart
    {"type":"bar","title":"Título corto","labels":["Ene","Feb","Mar"],"datasets":[{"label":"Serie","data":[1,2,3]}]}
    \`\`\`
    - TERMINANTEMENTE PROHIBIDO: dibujar la gráfica con caracteres de texto/ASCII, tablas markdown simulando barras, o cualquier "arte" hecho de símbolos.
    - "type" debe ser exactamente uno de: bar, line, pie, doughnut, radar.
    - Usa cifras reales o estimadas ilustrativas claras.
    - Estas gráficas se renderizan como imágenes reales en el chat y se incluyen
      automáticamente en el reporte de Word que el usuario descargue.`;
        
        // Call actual backend streaming API (estilo chat-widget.js)
        const ctrl = new AbortController();
        let API_BASE = '';
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            if (window.location.port !== '3001') API_BASE = 'http://localhost:3001';
        } else if (window.location.protocol === 'file:') {
            API_BASE = 'http://localhost:3001';
        }
        
        fetch(API_BASE + '/api/ai-insight-stream', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, systemPrompt: SYSTEM_PROMPT }),
            signal: ctrl.signal
        })
        .then(async (res) => {
            if (!res.ok) {
                if (res.status === 401) throw new Error("401_UNAUTHORIZED");
                const errBody = await res.json().catch(() => null);
                throw new Error(errBody?.error || "API error");
            }
            contentDiv.classList.remove('typing-indicator');
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buf = '';
            let fullText = '';

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
                    if (payload.text) {
                        fullText += payload.text;
                        contentDiv.innerHTML = renderMd(fullText);
                        _hydrateCharts(contentDiv);
                        scrollToBottom();
                    }
                    if (payload.done) {
                        saveCurrentSession();
                    }
                }
            }
            
            // Revisa intención de descarga de reporte
            const DOC_INTENT_RE = /\b(documento|reporte|word|\.doc|descargar|archivo)\b/i;
            if (DOC_INTENT_RE.test(text) || DOC_INTENT_RE.test(fullText.slice(0, 500))) {
                if (typeof VDS !== 'undefined' && VDS.downloadAsWord) {
                    const docBtn = document.createElement('button');
                    docBtn.style.marginTop = '15px';
                    docBtn.className = 'suggest-btn';
                    docBtn.innerHTML = '<i class="far fa-file-word"></i> Descargar Reporte';
                    docBtn.onclick = () => {
                        const stamp = new Date().toLocaleDateString('es-MX') + '_' + new Date().toLocaleTimeString('es-MX', {hour12:false});
                        VDS.downloadAsWord(`VALL-AI_reporte_${stamp.replace(/\//g, '-')}`, fullText, { title: 'Análisis VALL AI' });
                    };
                    contentDiv.appendChild(docBtn);
                    saveCurrentSession();
                }
            }
        })
        .catch(err => {
            console.error('Chat error:', err);
            contentDiv.classList.remove('typing-indicator');
            if (err.message === "401_UNAUTHORIZED") {
                contentDiv.innerHTML = "⚠️ Debes <b>iniciar sesión</b> para usar VALL-AI.";
            } else if (err.message && err.message !== "API error" && err.message !== "Failed to fetch") {
                contentDiv.innerHTML = `⚠️ ${escapeHtml(err.message)}`;
            } else {
                contentDiv.innerHTML = "Lo siento, parece que hay un problema de conexión con los servidores de VALL AI.";
            }
            saveCurrentSession();
        });
        
        function renderMd(text) {
            let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // Tablas markdown
            const tables = [];
            escaped = escaped.replace(/^(\|.*\|[ \t]*\n\|?[ \t:-]+\|[ \t:|-]*\n(?:\|.*\|[ \t]*\n?)+)/gm, (block) => {
                const rows = block.trim().split('\n').map(r => r.trim());
                const header = rows[0].replace(/^\||\|$/g, '').split('|').map(c => c.trim());
                const bodyRows = rows.slice(2).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
                let html = '<table style="width:100%; border-collapse:collapse; margin:1rem 0;"><thead><tr>' + header.map(h => `<th style="padding:.5rem; border-bottom:1px solid rgba(255,255,255,0.2); text-align:left;">${h}</th>`).join('') + '</tr></thead><tbody>';
                bodyRows.forEach(r => { html += '<tr>' + r.map(c => `<td style="padding:.5rem; border-bottom:1px solid rgba(255,255,255,0.05);">${c}</td>`).join('') + '</tr>'; });
                html += '</tbody></table>';
                tables.push(html);
                return `@@VN_TABLE_${tables.length - 1}@@`;
            });

            // Gráficas
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
                .replace(/^###\s+(.+)$/gm, '<div style="font-weight:700;margin:.5rem 0 .2rem;font-size:1.1em;color:#60a5fa;">$1</div>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,.1);padding:2px 5px;border-radius:4px;font-size:.85em">$1</code>')
                .replace(/^[\s]*(\d+\.\s+.+)/gm, '<li style="margin:2px 0;list-style:none">$1</li>')
                .replace(/^[\s]*[-•]\s+(.+)/gm, '<li style="margin:2px 0;list-style:none">• $1</li>')
                .replace(/\n\n+/g, '<br><br>')
                .replace(/\n/g, '<br>');

            tables.forEach((html, idx) => { out = out.replace(`@@VN_TABLE_${idx}@@`, html); });
            charts.forEach((spec, idx) => { out = out.replace(`@@VN_CHART_${idx}@@`, _chartBlockHtml(spec)); });
            if (hasLoadingChart) out = out.replace('@@VN_CHART_LOADING@@', '<div style="color:#60a5fa;margin-top:10px;"><i class="fas fa-spinner fa-spin"></i> Generando gráfica…</div>');
            return out;
        }

        function _chartBlockHtml(spec) {
            const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(spec))));
            return `<div class="vn-chart-wrap" data-chart-spec="${b64}" style="background:rgba(0,0,0,0.2); border-radius:10px; padding:10px; margin:1rem 0;">`
                + (spec.title ? `<div style="font-size:0.9rem; color:#94a3b8; margin-bottom:10px; text-align:center;">${spec.title}</div>` : '')
                + `<div style="position:relative; height:200px; width:100%;"><canvas></canvas></div>`
                + `</div>`;
        }

        function _hydrateCharts(container) {
            if (!container) return;
            const nodes = container.querySelectorAll('.vn-chart-wrap[data-chart-spec]');
            if (!nodes.length) return;
            if (typeof Chart === 'undefined') return;
            
            nodes.forEach(el => {
                const canvas = el.querySelector('canvas');
                if (!canvas || canvas.dataset.vnChart === '1') return;
                let spec;
                try { spec = JSON.parse(decodeURIComponent(escape(atob(el.dataset.chartSpec)))); } catch { return; }
                canvas.dataset.vnChart = '1';
                
                new Chart(canvas, {
                    type: spec.type || 'line',
                    data: {
                        labels: spec.labels,
                        datasets: spec.datasets.map(ds => ({
                            label: ds.label,
                            data: ds.data,
                            borderColor: ds.borderColor || '#3b82f6',
                            backgroundColor: ds.backgroundColor || 'rgba(59,130,246,0.1)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: !!ds.backgroundColor
                        }))
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true, labels: { color: '#cbd5e1' } } },
                        scales: {
                            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
                        }
                    }
                });
            });
        }
    }

    function scrollToBottom() {
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
