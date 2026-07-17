(function () {

    const LS_KEY = 'vn_lang';

    function getSaved() {
        try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
    }
    function saveLang(code, lang) {
        localStorage.setItem(LS_KEY, JSON.stringify({ code, lang }));
    }

    /* ── Cookie googtrans ─────────────────────────────────────────────── */
    function setGTCookie(lang) {
        const val  = lang === 'es' ? '' : `/es/${lang}`;
        const exp  = lang === 'es' ? 'Thu, 01 Jan 1970 00:00:00 UTC' : 'Fri, 31 Dec 2099 23:59:59 UTC';
        document.cookie = `googtrans=${val}; expires=${exp}; path=/`;
        document.cookie = `googtrans=${val}; expires=${exp}; path=/; domain=${location.hostname}`;
    }

    /* ── Google Translate ─────────────────────────────────────────────── */
    const gtDiv = document.createElement('div');
    gtDiv.id = 'google_translate_element';
    gtDiv.style.cssText = 'display:none;position:absolute;';
    document.body.appendChild(gtDiv);

    window.googleTranslateElementInit = function () {
        new google.translate.TranslateElement({
            pageLanguage: 'es',
            includedLanguages: 'en,es,pt,ja',
            autoDisplay: false
        }, 'google_translate_element');

        /* Restaurar idioma guardado después de que el widget esté listo */
        const saved = getSaved();
        if (saved && saved.lang !== 'es') {
            applyViaSelect(saved.lang);
        }
    };

    const gtScript = document.createElement('script');
    gtScript.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.head.appendChild(gtScript);

    function applyViaSelect(lang, attempts) {
        attempts = attempts || 0;
        const select = document.querySelector('select.goog-te-combo');
        if (select) {
            select.value = lang;
            select.dispatchEvent(new Event('change'));
        } else if (attempts < 20) {
            setTimeout(() => applyViaSelect(lang, attempts + 1), 300);
        }
    }

    /* ── CSS ─────────────────────────────────────────────────────────── */
    const css = `
.goog-te-banner-frame, #goog-gt-tt, .goog-te-balloon-frame { display:none !important; }
body { top: 0 !important; }
.skiptranslate { display:none !important; }

#vn-lang {
    position: relative;
    margin-left: auto;
    display: flex;
    align-items: center;
    padding-right: 1.6rem;
    flex-shrink: 0;
}
#vn-lang-btn {
    display: flex;
    align-items: center;
    gap: .35rem;
    cursor: pointer;
    background: rgba(255,255,255,.08);
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 6px;
    padding: 3px 7px 3px 4px;
    transition: background .18s;
}
#vn-lang-btn:hover { background: rgba(255,255,255,.15); }
#vn-lang-btn img {
    width: 24px;
    height: 15px;
    object-fit: cover;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,.2);
    display: block;
}
#vn-lang-arrow {
    font-size: .55rem;
    color: rgba(255,255,255,.6);
    margin-left: 2px;
    transition: transform .2s;
}
#vn-lang.open #vn-lang-arrow { transform: rotate(180deg); }

#vn-lang-menu {
    display: none;
    flex-direction: column;
    position: absolute;
    top: calc(100% + 8px);
    right: 1.6rem;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.18);
    border: 1px solid rgba(0,33,58,.08);
    overflow: hidden;
    min-width: 60px;
    z-index: 9999;
    animation: vn-fd .16s ease;
}
@keyframes vn-fd {
    from { opacity:0; transform:translateY(-6px); }
    to   { opacity:1; transform:translateY(0); }
}
#vn-lang.open #vn-lang-menu { display: flex; }

.vn-lang-opt {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: .45rem .6rem;
    cursor: pointer;
    transition: background .15s;
    border-bottom: 1px solid rgba(0,33,58,.05);
}
.vn-lang-opt:last-child { border-bottom: none; }
.vn-lang-opt:hover { background: #f0f4f8; }
.vn-lang-opt img {
    width: 26px;
    height: 17px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid rgba(0,0,0,.1);
    flex-shrink: 0;
}
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    /* ── Flags data ───────────────────────────────────────────────────── */
    const flags = [
        { code: 'mx', lang: 'es', label: 'Español' },
        { code: 'us', lang: 'en', label: 'English' },
        { code: 'pt', lang: 'pt', label: 'Português' },
        { code: 'jp', lang: 'ja', label: '日本語' },
    ];

    /* ── Widget HTML ──────────────────────────────────────────────────── */
    const saved  = getSaved();
    const active = saved || flags[0];

    const wrap = document.createElement('div');
    wrap.id = 'vn-lang';
    wrap.innerHTML = `
        <div id="vn-lang-btn">
            <img src="https://flagcdn.com/w80/${active.code}.png" alt="${active.label}" id="vn-lang-img">
            <span id="vn-lang-arrow">▼</span>
        </div>
        <div id="vn-lang-menu"></div>
    `;

    const menu   = wrap.querySelector('#vn-lang-menu');
    const btn    = wrap.querySelector('#vn-lang-btn');
    const btnImg = wrap.querySelector('#vn-lang-img');

    flags.forEach(f => {
        const opt = document.createElement('div');
        opt.className = 'vn-lang-opt';
        opt.title = f.label;
        opt.innerHTML = `<img src="https://flagcdn.com/w80/${f.code}.png" alt="${f.label}">`;
        opt.addEventListener('click', () => {
            btnImg.src = `https://flagcdn.com/w80/${f.code}.png`;
            btnImg.alt = f.label;
            wrap.classList.remove('open');
            saveLang(f.code, f.lang);
            setGTCookie(f.lang);
            if (f.lang === 'es') {
                location.reload();
            } else {
                applyViaSelect(f.lang);
            }
        });
        menu.appendChild(opt);
    });

    btn.addEventListener('click', e => {
        e.stopPropagation();
        wrap.classList.toggle('open');
    });
    document.addEventListener('click', () => wrap.classList.remove('open'));

    const hdrTop = document.querySelector('.hdr-top');
    if (hdrTop) hdrTop.appendChild(wrap);
})();
