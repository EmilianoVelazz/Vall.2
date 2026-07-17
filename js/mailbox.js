/* ══════════════════════════════════════════════
   MAILBOX (buzón) LOGIC - VALLNEWS
══════════════════════════════════════════════ */
function initMailbox() {
    const MAILBOX_KEY = 'vallnews_mailbox_state';
    
    // Default messages
    const defaultMessages = [
        { id: 1, title: 'Reporte Banxico Q2', desc: 'El análisis de tasas sugiere mantenimiento en 11%.', date: 'Hace 2 horas', read: false },
        { id: 2, title: 'Alerta Geopolítica', desc: 'Tensiones en el Medio Oriente incrementan el crudo WTI en 1.2%.', date: 'Hace 5 horas', read: false },
        { id: 3, title: 'Resumen Semanal', desc: 'Tu reporte automatizado de mercados está listo.', date: 'Ayer', read: true }
    ];

    localStorage.removeItem(MAILBOX_KEY);
    let messages = defaultMessages;

    const navMailbox = document.getElementById('navMailbox');
    let mailboxPanel = document.getElementById('mailboxPanel');
    let mailboxOverlay = document.getElementById('mailboxOverlay');
    
    // Si no existen los contenedores del buzón en la página, inyectarlos (necesario para chat.html y finanzas.html)
    if (!mailboxPanel) {
        mailboxOverlay = document.createElement('div');
        mailboxOverlay.className = 'mb-overlay';
        mailboxOverlay.id = 'mailboxOverlay';

        mailboxPanel = document.createElement('div');
        mailboxPanel.className = 'mb-panel';
        mailboxPanel.id = 'mailboxPanel';
        mailboxPanel.innerHTML = `
            <div class="mb-hdr">
                <h3>📬 buzón de Reportes</h3>
                <button class="mb-close" id="closeMailbox"><i class="fas fa-times"></i></button>
            </div>
            <div class="mb-body" id="mailboxList"></div>
        `;
        
        document.body.appendChild(mailboxOverlay);
        document.body.appendChild(mailboxPanel);
    }

    const closeMailbox = document.getElementById('closeMailbox');
    const mailboxList = document.getElementById('mailboxList');
    
    function updateBadge() {
        if(!navMailbox) return;
        const unread = messages.filter(m => !m.read).length;
        if(unread > 0) {
            navMailbox.classList.add('has-news');
        } else {
            navMailbox.classList.remove('has-news');
        }
    }

    function renderMessages() {
        if(!mailboxList) return;
        mailboxList.innerHTML = '';
        messages.forEach(msg => {
            const html = `
                <div class="mb-msg ${msg.read ? 'read' : 'unread'}" data-id="${msg.id}">
                    <div class="mb-msg-icon"><i class="fas fa-file-invoice"></i></div>
                    <div class="mb-msg-content">
                        <h4>${msg.title}</h4>
                        <p>${msg.desc}</p>
                        <span class="mb-date">${msg.date}</span>
                    </div>
                </div>
            `;
            mailboxList.insertAdjacentHTML('beforeend', html);
        });

        // Click to mark read
        document.querySelectorAll('.mb-msg').forEach(el => {
            el.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                const m = messages.find(x => x.id === id);
                if(m) {
                    m.read = true;
                    localStorage.setItem(MAILBOX_KEY, JSON.stringify(messages));
                    renderMessages();
                    updateBadge();
                }
            });
        });
    }

    if (navMailbox) {
        navMailbox.addEventListener('click', (e) => {
            e.preventDefault();
            mailboxPanel.classList.add('open');
            if(mailboxOverlay) mailboxOverlay.classList.add('open');
        });
    }
    
    if (closeMailbox) {
        closeMailbox.addEventListener('click', () => {
            mailboxPanel.classList.remove('open');
            if(mailboxOverlay) mailboxOverlay.classList.remove('open');
        });
    }

    if(mailboxOverlay) {
        mailboxOverlay.addEventListener('click', () => {
            mailboxPanel.classList.remove('open');
            mailboxOverlay.classList.remove('open');
        });
    }

    // ── APPLE LIQUID GLASS NAV INDICATOR ──
    const navCenter = document.querySelector('.nav-center');
    if (navCenter) {
        // Eliminar indicador previo si existe para evitar duplicados
        let existingIndicator = navCenter.querySelector('.nav-indicator');
        if (existingIndicator) existingIndicator.remove();

        const indicator = document.createElement('div');
        indicator.className = 'nav-indicator';
        navCenter.appendChild(indicator);

        const links = navCenter.querySelectorAll('.nav-link');
        const activeLink = navCenter.querySelector('.nav-link.active');

        function moveIndicator(el) {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const parentRect = navCenter.getBoundingClientRect();
            indicator.style.width = `${rect.width}px`;
            indicator.style.left = `${rect.left - parentRect.left}px`;
            indicator.style.opacity = '1';
        }

        // Posición inicial
        if (activeLink) {
            setTimeout(() => moveIndicator(activeLink), 150); // Esperar renderizado fuente
            window.addEventListener('resize', () => moveIndicator(activeLink));
        }

        // Interacción fluida
        links.forEach(link => {
            link.addEventListener('mouseenter', (e) => {
                moveIndicator(e.currentTarget);
            });
        });

        // Retorno automático tipo resorte
        navCenter.addEventListener('mouseleave', () => {
            if (activeLink) {
                moveIndicator(activeLink);
            } else {
                indicator.style.opacity = '0';
            }
        });
    }

    renderMessages();
    updateBadge();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMailbox);
} else {
    initMailbox();
}

