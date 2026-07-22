(function () {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const base  = parts.length > 1 ? '../' : '';

    // Ocultar el chat widget mientras el loader esté activo
    // El contenido debe mostrarse inmediatamente. Los datos se actualizan en
    // segundo plano sin bloquear ni hacer parpadear la página completa.
    document.documentElement.classList.remove('vn-loading');

    const style = document.createElement('style');
    style.textContent = `
        html.vn-loading #vn-cw { display: none !important; }

        #vn-loader {
            display: none !important;
            position: fixed; inset: 0; z-index: 99999;
            background: #06111f;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 1.2rem;
            transition: opacity .5s ease;
        }
        #vn-loader.vn-hidden {
            opacity: 0;
            pointer-events: none;
        }
        .vnl-logo {
            width: 64px; height: 64px;
            border-radius: 14px; object-fit: contain;
        }
        .vnl-brand {
            font-family: 'Inter', sans-serif;
            font-size: 1.5rem; font-weight: 700;
            color: #e2ebf6; letter-spacing: .03em;
        }
        .vnl-bar-outer {
            width: 220px; height: 3px;
            background: rgba(255,255,255,.08);
            border-radius: 2px; overflow: hidden;
        }
        .vnl-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #d97706, #fbbf24);
            border-radius: 2px;
            animation: vnl-prog 15s ease forwards;
        }
        @keyframes vnl-prog {
            0%   { width: 0%  }
            20%  { width: 35% }
            50%  { width: 65% }
            80%  { width: 85% }
            100% { width: 92% }
        }
        .vnl-text {
            font-family: 'Inter', sans-serif;
            font-size: .75rem; color: #6b7f9a;
            letter-spacing: .08em; text-transform: uppercase;
        }
        .vnl-dots span {
            display: inline-block;
            animation: vnl-dot 1.3s ease-in-out infinite;
        }
        .vnl-dots span:nth-child(2) { animation-delay: .2s; }
        .vnl-dots span:nth-child(3) { animation-delay: .4s; }
        @keyframes vnl-dot {
            0%, 80%, 100% { opacity: .2; }
            40%            { opacity: 1;  }
        }
    `;
    document.head.appendChild(style);

    const el = document.createElement('div');
    el.id = 'vn-loader';
    el.innerHTML = `
        <img class="vnl-logo" src="${base}Logotipos/logo1.png" alt="VALLNews"
             onerror="this.style.display='none'">
        <div class="vnl-brand">VALLNews</div>
        <div class="vnl-bar-outer"><div class="vnl-bar-fill"></div></div>
        <div class="vnl-text" id="vnlText">
            Cargando datos<span class="vnl-dots">
                <span>.</span><span>.</span><span>.</span>
            </span>
        </div>
    `;

    // Inyectar inmediatamente en <html> para cubrir la pantalla antes del <body>
    document.documentElement.appendChild(el);
    el.style.display = 'none';

    // Fallback: ocultar si después de 45 s algo falla y nunca se llama hide()
    // 45 s da margen para: cold-start del backend (~15 s) + loadNews (~20 s) = ~35 s.
    const fallback = setTimeout(() => hide(true), 4500);
    let hidden = false;

    function hide(force) {
        if (hidden) return;
        clearTimeout(fallback);
        function doHide() {
            if (hidden) return;
            hidden = true;
            el.classList.add('vn-hidden');
            setTimeout(function () {
                el.style.display = 'none';
                document.documentElement.classList.remove('vn-loading');
            }, 520);
        }
        if (!force && window._vnAuthPending) {
            var p = window._vnAuthPending;
            window._vnAuthPending = null;
            Promise.resolve(p).then(doHide, doHide);
        } else {
            doHide();
        }
    }

    window.VNLoader = {
        hide,
        setText(msg) {
            const t = document.getElementById('vnlText');
            if (t) t.innerHTML = msg + `<span class="vnl-dots">
                <span>.</span><span>.</span><span>.</span></span>`;
        },
    };
})();

// ── Hamburger / mobile nav ────────────────────────────────────
(function () {
    function _initHam() {
        var top = document.querySelector('.hdr-top');
        var nav = document.querySelector('.hdr-nav');
        if (!top || !nav || document.querySelector('.vn-hamburger')) return;

        var btn = document.createElement('button');
        btn.className = 'vn-hamburger';
        btn.setAttribute('aria-label', 'Menú');
        btn.innerHTML = '<span></span><span></span><span></span>';
        top.appendChild(btn);

        function close() {
            nav.classList.remove('vn-nav-open');
            btn.classList.remove('vn-ham-open');
            document.body.style.overflow = '';
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = nav.classList.toggle('vn-nav-open');
            btn.classList.toggle('vn-ham-open', open);
            document.body.style.overflow = open ? 'hidden' : '';
        });

        document.addEventListener('click', function (e) {
            if (nav.classList.contains('vn-nav-open') &&
                !nav.contains(e.target) && e.target !== btn) {
                close();
            }
        });

        nav.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', close);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _initHam);
    } else {
        _initHam();
    }
})();

// ── Menú desplegable del usuario ──────────────────────────────
(function () {
    var _base = (window.location.pathname.split('/').filter(Boolean).length > 1) ? '../' : '';

    function _closeHam() {
        var nav = document.querySelector('.hdr-nav');
        var btn = document.querySelector('.vn-hamburger');
        if (nav) nav.classList.remove('vn-nav-open');
        if (btn) btn.classList.remove('vn-ham-open');
        document.body.style.overflow = '';
    }

    function _initUserMenu() {
        var navUser = document.querySelector('.nav-user');
        if (!navUser || document.getElementById('vn-user-menu')) return;

        var style = document.createElement('style');
        style.textContent = `
            .nav-user { position: relative !important; }

            /* ── Desktop: dropdown ───────────────────── */
            #vn-user-menu {
                position: absolute;
                top: calc(100% + 6px);
                right: 0;
                background: #fff;
                border-radius: 10px;
                box-shadow: 0 8px 32px rgba(0,0,0,.20);
                border: 1px solid rgba(0,0,0,.08);
                min-width: 175px;
                z-index: 2000;
                overflow: hidden;
                display: none;
                flex-direction: column;
            }
            #vn-user-menu.vn-um-open {
                display: flex;
                animation: vnu-in .18s ease;
            }
            @keyframes vnu-in {
                from { opacity: 0; transform: translateY(-6px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            .vn-um-item {
                display: flex;
                align-items: center;
                gap: .55rem;
                padding: .78rem 1.1rem;
                background: none;
                border: none;
                width: 100%;
                text-align: left;
                font-family: 'Inter', sans-serif;
                font-size: .8rem;
                font-weight: 500;
                color: #1e293b;
                cursor: pointer;
                transition: background .15s;
                text-decoration: none;
                white-space: nowrap;
            }
            .vn-um-item i { font-size: .82rem; width: 14px; text-align: center; }
            .vn-um-item:hover { background: #f1f5f9; }
            .vn-um-logout { border-top: 1px solid #f1f5f9; color: #dc2626 !important; }
            .vn-um-logout:hover { background: #fff5f5 !important; }

            /* ── Móvil: ítems nativos en el overlay hamburguesa ─── */
            .vn-nav-sep {
                display: none;
                width: 100%;
                max-width: 320px;
                border: none;
                border-top: 1px solid rgba(255,255,255,.12);
                margin: .6rem 0 .2rem;
                flex-shrink: 0;
            }
            .vn-nav-mi {
                display: none;
                align-items: center;
                justify-content: center;
                gap: .6rem;
                width: 100%;
                max-width: 320px;
                padding: .95rem 1.5rem;
                background: none;
                border: none;
                border-bottom: 1px solid rgba(255,255,255,.08);
                font-family: 'Inter', sans-serif;
                font-size: 1.05rem;
                font-weight: 500;
                color: rgba(255,255,255,.82);
                cursor: pointer;
                transition: color .18s, background .18s;
                letter-spacing: .01em;
            }
            .vn-nav-mi:hover { color: #fff; background: rgba(255,255,255,.05); }
            .vn-nav-mi i { font-size: .92rem; opacity: .8; }
            .vn-nav-mi-logout { color: rgba(255,130,130,.9) !important; }
            .vn-nav-mi-logout:hover { color: #ff9a9a !important; background: rgba(220,38,38,.08) !important; }

            @media (max-width: 768px) {
                #vn-user-menu { display: none !important; }
                .nav-user { pointer-events: none; opacity: .5; font-size: 1.15rem !important; }
                .vn-nav-sep { display: block; }
                .vn-nav-mi  { display: flex; }
            }
        `;
        document.head.appendChild(style);

        /* Desktop dropdown */
        var menu = document.createElement('div');
        menu.id = 'vn-user-menu';
        menu.innerHTML =
            '<button class="vn-um-item" id="vn-um-config"><i class="fas fa-sliders"></i> Configuración</button>' +
            '<button class="vn-um-item vn-um-logout" id="vn-um-logout"><i class="fas fa-right-from-bracket"></i> Cerrar sesión</button>';
        navUser.style.position = 'relative';
        navUser.removeAttribute('onclick');
        navUser.appendChild(menu);

        /* Móvil: inyectar ítems dentro del overlay .hdr-nav */
        var hdrNav = document.querySelector('.hdr-nav');
        if (hdrNav) {
            var sep = document.createElement('hr');
            sep.className = 'vn-nav-sep';

            var miConfig = document.createElement('button');
            miConfig.className = 'vn-nav-mi';
            miConfig.innerHTML = '<i class="fas fa-sliders"></i> Configuración';

            var miLogout = document.createElement('button');
            miLogout.className = 'vn-nav-mi vn-nav-mi-logout';
            miLogout.innerHTML = '<i class="fas fa-right-from-bracket"></i> Cerrar sesión';

            hdrNav.appendChild(sep);
            hdrNav.appendChild(miConfig);
            hdrNav.appendChild(miLogout);

            miConfig.addEventListener('click', function () {
                _closeHam();
                window.location.href = _base + 'configuracion/configuracion.html';
            });
            miLogout.addEventListener('click', function () {
                _closeHam();
                try { fetch('/api/logout', { method: 'POST' }); } catch (_) {}
                localStorage.clear();
                sessionStorage.removeItem('vn_auth');
                sessionStorage.removeItem('vn_user');
                window.location.href = _base + 'index.html';
            });
        }

        /* Desktop: toggle dropdown */
        navUser.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.toggle('vn-um-open');
        });
        document.addEventListener('click', function (e) {
            if (!navUser.contains(e.target)) menu.classList.remove('vn-um-open');
        });
        document.getElementById('vn-um-config').addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.remove('vn-um-open');
            window.location.href = _base + 'configuracion/configuracion.html';
        });
        document.getElementById('vn-um-logout').addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.remove('vn-um-open');
            try { fetch('/api/logout', { method: 'POST' }); } catch (_) {}
            localStorage.clear();
            sessionStorage.removeItem('vn_auth');
            sessionStorage.removeItem('vn_user');
            window.location.href = _base + 'index.html';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _initUserMenu);
    } else {
        _initUserMenu();
    }
})();
