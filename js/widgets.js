/* ══════════════════════════════════════════════
   WIDGETS LOGIC - VALLNEWS
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    const WIDGETS_KEY = 'vallnews_widgets_prefs';
    
    // Default config
    const defaultWidgets = {
        'w-noticias': true,
        'w-vallai': true,
        'w-divisas': true,
        'w-commodities': false
    };

    let userWidgets = JSON.parse(localStorage.getItem(WIDGETS_KEY)) || defaultWidgets;

    const modalOverlay = document.getElementById('widgetModal');
    const openBtn = document.getElementById('btnConfigWidgets');
    const closeBtn = document.getElementById('wmClose');
    const toggles = document.querySelectorAll('.wm-toggle');

    // Inicializar UI
    function renderWidgets() {
        Object.keys(userWidgets).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (userWidgets[id]) {
                    el.classList.remove('w-hidden');
                } else {
                    el.classList.add('w-hidden');
                }
            }
        });
    }

    function renderToggles() {
        toggles.forEach(chk => {
            const target = chk.getAttribute('data-target');
            chk.checked = userWidgets[target];
        });
    }

    // Eventos de toggles
    toggles.forEach(chk => {
        chk.addEventListener('change', (e) => {
            const target = e.target.getAttribute('data-target');
            userWidgets[target] = e.target.checked;
            localStorage.setItem(WIDGETS_KEY, JSON.stringify(userWidgets));
            renderWidgets();
        });
    });

    // Remover desde la tarjeta
    document.querySelectorAll('.widget-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.widget-card');
            const id = card.id;
            userWidgets[id] = false;
            localStorage.setItem(WIDGETS_KEY, JSON.stringify(userWidgets));
            renderWidgets();
            renderToggles();
        });
    });

    // Modal
    if(openBtn && modalOverlay && closeBtn) {
        openBtn.addEventListener('click', () => {
            renderToggles();
            modalOverlay.classList.add('open');
        });
        
        closeBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('open');
        });
        
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('open');
        });
    }

    renderWidgets();
});
