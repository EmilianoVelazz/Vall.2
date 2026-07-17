(function () {
    // Favorites overlay when leaving finance page
    const overlayStyle = document.createElement('style');
    overlayStyle.textContent = `
        .fav-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
        .fav-overlay.show { opacity: 1; pointer-events: auto; }
        .fav-content { background: #fff; border-radius: 12px; padding: 2rem; max-width: 90vw; max-height: 90vh; overflow: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .fav-header { font-size: 1.5rem; font-weight: 800; margin-bottom: 1rem; color: #001827; }
        .fav-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 1rem; }
        .fav-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; text-align: center; font-weight: 600; color: #001827; }
    `;
    document.head.appendChild(overlayStyle);

    function init() {
        const overlay = document.createElement('div');
        overlay.className = 'fav-overlay';
        overlay.innerHTML = `
            <div class="fav-content">
                <div class="fav-header">Favoritos</div>
                <div class="fav-cards">
                    <div class="fav-card">📊 Favorito 1</div>
                    <div class="fav-card">📈 Favorito 2</div>
                    <div class="fav-card">💹 Favorito 3</div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        function showOverlayAndNavigate(href) {
            overlay.classList.add('show');
            setTimeout(() => { window.location.href = href; }, 2000);
        }
        document.addEventListener('click', function (e) {
            const a = e.target.closest('a');
            if (!a) return;
            const href = a.getAttribute('href');
            if (!href) return;
            const isFinance = window.location.pathname.toLowerCase().includes('finanzas/finanzas.html');
            const leavesFinance = isFinance && !href.toLowerCase().includes('finanzas/finanzas.html');
            if (leavesFinance) {
                e.preventDefault();
                showOverlayAndNavigate(href);
            }
        });
    }

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();
