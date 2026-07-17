import { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { usePageStyles, loadScriptsInOrder } from '../lib/assets.js';
import './Inicio.css';

const INITIAL_TILES = [
  { k: 'tiie', label: 'TIIE 28D', val: null },
  { k: 'wti', label: 'Petróleo WTI', val: null },
  { k: 'corn', label: 'Maíz · CME', val: null },
  { k: 'mxn', label: 'USD/MXN', val: null },
];

// Markup central del inicio, reutilizado del sitio original para preservar el
// diseño. Empieza con la Tierra inmersiva (world-descent) — SIN el carrusel de
// fotos viejo (heroSlider), tal como la versión buena inicio_recovered.html.
const INICIO_HTML = `
<style>
  .report-generator { padding: 0.5rem 0; }
  .rg-section { margin-bottom: 1.2rem; }
  .rg-label { display:block; font-weight:600; color:var(--clr-text-main); margin-bottom:.5rem; font-size:.82rem; letter-spacing:.02em; }
  .rg-input, .rg-select { width:100%; padding:.7rem .8rem; border:1px solid var(--bdr-hard); border-radius:9px; background:var(--clr-bg); color:var(--clr-text-main); font-family:inherit; font-size:.9rem; transition:border-color .2s, box-shadow .2s; }
  .rg-input:focus, .rg-select:focus { outline:none; border-color:var(--clr-gold); box-shadow:0 0 0 3px rgba(168, 137, 76,.15); }
  .rg-btn { width:100%; padding:.85rem 1rem; background:linear-gradient(180deg,#607193,#45536e); color:#fff; border:none; border-radius:9px; font-weight:600; cursor:pointer; transition:transform .15s, box-shadow .25s; font-size:.9rem; display:flex; align-items:center; justify-content:center; gap:.55rem; box-shadow:0 8px 20px -8px rgba(10,28,51,.5); }
  .rg-btn i { color:var(--clr-gold-lt); }
  .rg-btn:hover { transform:translateY(-2px); box-shadow:0 12px 26px -8px rgba(10,28,51,.6); }
  .rg-btn:active { transform:translateY(0); }
  .rg-btn:disabled { opacity:.6; cursor:not-allowed; }
  .rg-status { padding:.9rem; border-radius:8px; font-size:.85rem; margin-top:1rem; }
  .rg-status.success { background:#dcfce7; color:#166534; border-left:3px solid #22c55e; }
  .rg-status.error { background:#fee2e2; color:#991b1b; border-left:3px solid #ef4444; }
  .rg-status.loading { background:#e8eefc; color:#607193; border-left:3px solid var(--clr-gold); display:flex; align-items:center; gap:.6rem; }
  .rg-status .spinner { display:inline-block; width:14px; height:14px; border:2px solid transparent; border-top-color:var(--clr-gold); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
<section class="world-descent" id="worldDescent">
    <div class="world-sticky" aria-hidden="true">
        <div class="world-map-layer">
            <svg class="world-map-svg" viewBox="0 0 1200 620" role="img" aria-label="Mapa del mundo">
                <path d="M170 214c43-36 101-51 154-35 38 12 65 36 98 55 42 24 89 28 134 11 35-13 65-39 103-45 50-8 97 22 135 54 31 27 62 58 104 66 44 8 88-11 129-28 52-21 112-34 163-7" />
                <path d="M128 360c54-28 115-34 173-17 50 15 92 49 143 62 74 18 148-22 219-50 76-30 166-43 237-2 32 19 58 48 94 60 48 17 101-2 149-18" />
                <path d="M210 454c60 12 119 27 179 37 91 16 186 17 275-8 58-16 112-43 172-49 95-9 185 35 278 46" />
                <path d="M260 126c58 16 113 44 174 46 65 2 123-26 184-42 98-26 205-9 289 48" />
                <path d="M242 170c-58 32-93 88-81 132 10 36 55 41 90 67 49 36 40 96 86 127 28 19 65 15 92-5 29-22 41-59 31-92-13-43-61-64-85-100-27-41-12-95-46-128-22-22-57-26-87-1z" />
                <path d="M538 177c-38 5-72 32-85 68-17 48 16 90 36 132 19 39 24 88 62 111 39 24 91 2 112-38 18-34 10-76 31-108 18-27 54-37 72-65 23-36 4-88-33-108-30-16-66-8-98 4-32 12-64-1-97 4z" />
                <path d="M799 169c-40 14-72 48-83 89-12 47 9 98 48 126 36 26 84 23 126 39 54 20 88 74 143 91 40 13 89-3 107-42 19-41-4-89-38-118-33-28-77-40-107-72-34-37-43-94-86-121-31-19-73-5-110 8z" />
            </svg>
            <div class="world-grid-lines"></div>
        </div>

        <div class="earth-wrap" id="earthWrap">
            <div class="earth-glow"></div>
            <canvas class="earth-canvas" id="earthCanvas" aria-hidden="true"></canvas>
            <div class="earth-core">
                <div class="earth-clouds"></div>
                <div class="earth-continent c-americas"></div>
                <div class="earth-continent c-eurasia"></div>
                <div class="earth-continent c-africa"></div>
                <div class="earth-continent c-australia"></div>
            </div>
        </div>

        <div class="world-copy">
            <span class="world-kicker reveal-up active">VALLNEWS GLOBAL INTELLIGENCE</span>
            <h1 class="im-title-mega world-title reveal-up active">Del mapa al pulso del planeta.</h1>
            <p class="im-subtitle world-subtitle reveal-up active" id="aiGlobalSummary">
                <i class="fas fa-circle-notch fa-spin"></i> VALL AI está procesando el sentimiento del mercado global...
            </p>
        </div>

        <div class="world-market-dock reveal-up active">
            <div class="spark-grid" id="sparkGrid">
                <!-- Se inyecta vía JS -->
            </div>
        </div>

        <div class="world-scroll-cue">
            <span>Desciende al planeta</span>
            <i class="fas fa-arrow-down"></i>
        </div>
    </div>
</section>
<section class="im-section news-arrival" style="background: var(--clr-surface); backdrop-filter: blur(40px) saturate(180%); -webkit-backdrop-filter: blur(40px) saturate(180%); border-top: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 -30px 60px rgba(0,0,0,0.2); position: relative; overflow: hidden;">
    <style>
        .im-section.news-arrival::before {
            content: '';
            position: absolute;
            top: -50%; left: -20%;
            width: 800px; height: 800px;
            background: radial-gradient(circle, rgba(168, 137, 76, 0.08) 0%, transparent 70%);
            border-radius: 50%;
            pointer-events: none;
            animation: imSectionPulse 6s ease-in-out infinite;
        }

        @keyframes imSectionPulse {
            0%, 100% { transform: scale(1) translateY(0); opacity: 0.5; }
            50% { transform: scale(1.2) translateY(30px); opacity: 0.8; }
        }
    </style>

    <div class="im-content" style="max-width: 1400px; position: relative; z-index: 2;">
        <h2 class="reveal-up" style="font-size:2.5rem; color:var(--clr-primary); margin-bottom:1rem; font-weight:800; letter-spacing:-1px;">Historias que Mueven al Mundo</h2>
        <p class="reveal-up" style="color:var(--clr-text-mut); margin-bottom:2rem; font-size:1.1rem; max-width:600px;">Desliza para explorar el feed en tiempo real de mercados y geopolítica.</p>

        <div class="im-carousel-container reveal-up" style="transition-delay:0.3s;">
            <div class="im-carousel cine-slider-wrap" id="liveNewsCarousel">
                <div class="im-c-item active" style="justify-content:center; align-items:center; opacity:1;">
                    <i class="fas fa-circle-notch fa-spin" style="font-size:2rem; color:var(--clr-accent);"></i>
                    <p style="margin-top:1rem; font-weight:600; color:var(--clr-text-mut);">Obteniendo noticias globales...</p>
                </div>
            </div>
        </div>

    </div>
</section>
<section class="vn-bento-section">
    <div class="bento-header reveal-up">
        <div class="bento-kicker"><span class="bento-kicker-dot"></span> Arquitectura de datos institucional</div>
        <h2>4 Ejes, 1 Visión.</h2>
        <p>Mientras navegas, sumérgete en el análisis macroeconómico. Selecciona tu ruta estratégica en nuestra arquitectura de datos de grado institucional.</p>
    </div>

    <div class="bento-grid reveal-up" style="transition-delay: 0.2s;">
        <a href="/mercados" class="bento-card bento-hero">
            <div class="bento-bg" style="background-image: url('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80');"></div>
            <div class="bento-glass">
                <h3>Mercados Globales</h3>
                <p>Renta variable en tiempo real. Análisis profundo de índices y emisoras cotizadas en bolsa a través de nuestras terminales avanzadas.</p>
            </div>
        </a>

        <a href="/geopolitica" class="bento-card bento-geo">
            <div class="bento-bg" style="background-image: url('https://images.unsplash.com/photo-1529400971008-f566de0e6dfc?w=1200&q=80');"></div>
            <div class="bento-glass">
                <h3>Geopolítica</h3>
                <p>Monitoreo algorítmico del crudo, materias primas y conflictos internacionales.</p>
            </div>
        </a>

        <a href="/finanzas" class="bento-card bento-fin">
            <div class="bento-bg" style="background-image: url('https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80');"></div>
            <div class="bento-glass">
                <h3>Finanzas</h3>
                <p>Métricas de deuda soberana, tasas de interés mundiales y crédito corporativo.</p>
            </div>
        </a>

        <a href="/mexico" class="bento-card bento-mex">
            <div class="bento-bg" style="background-image: url('https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=1200&q=80');"></div>
            <div class="bento-glass">
                <h3>Perspectiva México</h3>
                <p>La resiliencia del peso, política monetaria (Banxico) y proyecciones macro frente al nearshoring.</p>
            </div>
        </a>
    </div>
</section>

<!-- Buzón (Generador de Reportes) -->
<div class="mb-overlay" id="mailboxOverlay"></div>
<div class="mb-panel" id="mailboxPanel">
    <div class="mb-hdr">
        <h3><i class="fas fa-inbox"></i> Generador de Reportes</h3>
        <button class="mb-close" id="closeMailbox"><i class="fas fa-times"></i></button>
    </div>

    <div class="report-generator" style="padding: 1rem; border-bottom: 1px solid var(--bdr-soft); flex: 0 0 auto;">
        <div class="rg-section">
            <label for="userEmail" class="rg-label">📧 Tu Correo Electrónico</label>
            <input type="email" id="userEmail" class="rg-input" placeholder="tu@email.com" required>
            <small style="color: #999; font-size: 0.75rem;">Los reportes se enviarán a este correo</small>
        </div>

        <div class="rg-section">
            <label for="reportType" class="rg-label">📊 Tipo de Reporte</label>
            <select id="reportType" class="rg-select">
                <option value="market">📈 Análisis de Mercados Globales</option>
                <option value="geopolitical">🌍 Análisis Geopolítico</option>
                <option value="mexico">🇲🇽 Perspectiva México</option>
            </select>
            <small style="color: #999; font-size: 0.75rem;">Elige el tipo de análisis que deseas</small>
        </div>

        <button id="generateReportBtn" class="rg-btn">
            <i class="fas fa-file-word"></i> Generar y Enviar Reporte
        </button>

        <div id="reportStatus" class="rg-status" style="display: none;"></div>
    </div>

    <div style="padding: 1rem 0; border-bottom: 1px solid var(--bdr-soft);">
        <h4 style="color: var(--clr-primary); font-size: 0.95rem; margin: 0 1rem 0.8rem 1rem;">📬 Reportes Recibidos</h4>
    </div>

    <div class="mb-body" id="mailboxList"></div>
</div>
`;

export default function Inicio() {
  usePageStyles([
    '/css/header.css?v=4',
    '/css/footer.css',
    '/css/immersive.css?v=85',
    '/css/hero.css?v=1',
  ]);
  const [tiles, setTiles] = useState(INITIAL_TILES);

  useEffect(() => {
    // ── Parallax del orbe de IA ───────────────────────────────────────────
    const orbMove = (e) => {
      const orbWrap = document.querySelector('.im-ai-orb-wrap');
      if (!orbWrap) return;
      const rect = orbWrap.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const distance = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);
      if (distance < 400) {
        const pull = (1 - distance / 400) * 15;
        orbWrap.style.transform = `translate(${Math.cos(angle) * pull}px, ${Math.sin(angle) * pull}px)`;
      } else {
        orbWrap.style.transform = 'translate(0, 0)';
      }
    };
    document.addEventListener('mousemove', orbMove);

    // ── Parallax de las sparklines ────────────────────────────────────────
    const onScroll = () => {
      const sparkGrid = document.getElementById('sparkGrid');
      if (!sparkGrid) return;
      const scrolled = window.scrollY;
      sparkGrid.style.transform = `translateY(${scrolled * 0.15}px)`;
      sparkGrid.style.opacity = Math.max(0.3, 1 - scrolled / 2000);
    };
    window.addEventListener('scroll', onScroll);

    // ── Observer de entrada de secciones + estilos dinámicos ──────────────
    const sections = document.querySelectorAll('.im-section');
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('section-visible');
      });
    }, { threshold: 0.1 });
    sections.forEach((section) => {
      sectionObserver.observe(section);
      section.style.opacity = '0.7';
    });
    const dynStyle = document.createElement('style');
    dynStyle.dataset.vnDynamic = 'inicio';
    dynStyle.textContent = `
      .im-section { transition: opacity 0.8s ease; }
      .im-section.section-visible { opacity: 1 !important; }
      @media (prefers-reduced-motion: no-preference) {
        .im-title-mega { animation: imTextShimmer 4s ease-in-out infinite; }
      }
      .spark-path { stroke-dasharray: 300; stroke-dashoffset: 300; animation: strokeAnimation 2s ease forwards; }
      @keyframes strokeAnimation { from { stroke-dashoffset: 300; } to { stroke-dashoffset: 0; } }
    `;
    document.head.appendChild(dynStyle);

    // ── Widgets legacy (Tierra, noticias en vivo, buzón, reportes, chat) ──
    let disposed = false;
    (async () => {
      await loadScriptsInOrder([
        '/js/api-keys.js?v=4',
        '/js/data-service.js?v=15',
        '/js/live-engine.js?v=24',
        '/js/immersive.js?v=30',
        '/js/mailbox.js',
        '/js/reports.js',
        ['/js/chat-widget.js?v=24', { 'data-mascota': '/Logotipos/mascota-atlas.svg' }],
      ]);
      if (disposed) return;
      // immersive.js y reports.js escuchan DOMContentLoaded (ya disparado en la
      // SPA); lo re-emitimos para que se inicialicen sobre el DOM ya montado.
      document.dispatchEvent(new Event('DOMContentLoaded'));

      // Métricas en vivo del hero (reutiliza window.VDS).
      const VDS = window.VDS;
      if (VDS) {
        const [t, o, c, m] = await Promise.allSettled([
          VDS.banxico('SF61745'),
          VDS.commodityWithPct('CRUDE_OIL'),
          VDS.commodityWithPct('CORN'),
          VDS.usdmxn(),
        ]);
        if (disposed) return;
        const v = (r) => (r.status === 'fulfilled' ? r.value : null);
        setTiles([
          { k: 'tiie', label: 'TIIE 28D', val: v(t) != null ? `${parseFloat(v(t)).toFixed(2)}%` : '—' },
          { k: 'wti', label: 'Petróleo WTI', val: v(o)?.price != null ? `$${v(o).price.toFixed(1)}` : '—' },
          { k: 'corn', label: 'Maíz · CME', val: v(c)?.price != null ? `$${v(c).price.toFixed(2)}` : '—' },
          { k: 'mxn', label: 'USD/MXN', val: v(m) != null ? parseFloat(v(m)).toFixed(2) : '—' },
        ]);
      }
    })();

    return () => {
      disposed = true;
      document.removeEventListener('mousemove', orbMove);
      window.removeEventListener('scroll', onScroll);
      sectionObserver.disconnect();
      dynStyle.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Header />

      {/* Hero premium institucional (cohesivo con el login) */}
      <section className="ini-hero">
        <div className="ini-hero-grid" aria-hidden="true"></div>
        <div className="ini-hero-inner">
          <div className="ini-hero-copy">
            <div className="ini-eyebrow"><span className="ini-eyebrow-dot"></span> Terminal de Inteligencia Económica</div>
            <h1 className="ini-headline">El pulso del planeta,<br /><em>en tiempo real.</em></h1>
            <p className="ini-sub">
              Mercados globales, geopolítica y México — datos en vivo y análisis con inteligencia
              artificial, en una sola terminal de grado institucional.
            </p>
            <div className="ini-hero-cue"><i className="fas fa-arrow-down"></i> Desciende al planeta</div>
          </div>
          <div className="ini-metrics">
            {tiles.map((t) => (
              <div className="ini-metric" key={t.k}>
                <span className="ini-metric-label">{t.label}</span>
                <span className={`ini-metric-val${t.val == null ? ' pending' : ''}`}>{t.val ?? '···'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div dangerouslySetInnerHTML={{ __html: INICIO_HTML }} />
      <Footer />
    </>
  );
}
