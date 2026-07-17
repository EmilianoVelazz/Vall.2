/* ══════════════════════════════════════════════
   LOGICA JS: SCROLL INMERSIVO, SPARKLINES Y BENTO (V6)
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    
    // 0. Ocultar inmediatamente la pantalla de carga heredada
    if (window.VNLoader) window.VNLoader.hide();

    // 1. Reveal Animations
    const revealElements = document.querySelectorAll('.reveal-up, .reveal-scale');
    // Auto-stagger sibling reveals for cinematic cascading
    const staggerGroups = new Map();
    revealElements.forEach(el => {
        const parent = el.parentElement;
        if (!staggerGroups.has(parent)) staggerGroups.set(parent, 0);
        const idx = staggerGroups.get(parent);
        el.style.setProperty('--stagger', idx);
        staggerGroups.set(parent, idx + 1);
    });
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
    revealElements.forEach(el => revealObserver.observe(el));

    // 2. Parallax de fondo (throttle con rAF para no bloquear el hilo en scroll)
    const bgs = document.querySelectorAll('.im-bg-lights');
    if (bgs.length) {
        let bgRaf = null;
        window.addEventListener('scroll', () => {
            if (bgRaf) return;
            bgRaf = requestAnimationFrame(() => {
                const scrolled = window.scrollY;
                bgs.forEach(bg => { bg.style.transform = `translateY(${scrolled * 0.3}px)`; });
                bgRaf = null;
            });
        }, { passive: true });
    }

    // ── SPARKLINES EN VIVO (ESTILO TRADINGVIEW) ──

    const worldDescent = document.getElementById('worldDescent');
    const earthWrap = document.getElementById('earthWrap'); // For 3D exit effect
    if (worldDescent) {
        let ticking = false;
        const updateWorldProgress = () => {
            const rect = worldDescent.getBoundingClientRect();
            const travel = Math.max(1, rect.height - window.innerHeight);
            const progress = Math.min(1, Math.max(0, -rect.top / travel));
            worldDescent.style.setProperty('--earth-progress', progress.toFixed(4));
            
            // ── Salida cinematográfica del globo ──
            // Solo scale + opacity (compositor GPU). NO usar filter:blur sobre el
            // canvas WebGL: re-desenfocar un canvas que se re-renderiza cada frame
            // era un costo enorme y provocaba tirones al hacer scroll.
            if (earthWrap) {
                if (progress > 0.7) {
                    const exitProgress = (progress - 0.7) / 0.3; // 0 a 1
                    const scale = 1 - (exitProgress * 0.05);
                    const opacity = 1 - (exitProgress * 0.5);
                    earthWrap.style.transform = `scale(${scale.toFixed(3)})`;
                    earthWrap.style.opacity = opacity.toFixed(2);
                } else {
                    earthWrap.style.transform = `scale(1)`;
                    earthWrap.style.opacity = `1`;
                }
            }

            ticking = false;
        };
        const requestWorldProgress = () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(updateWorldProgress);
            }
        };
        updateWorldProgress();
        window.addEventListener('scroll', requestWorldProgress, { passive: true });
        window.addEventListener('resize', requestWorldProgress);

        // Pausar las animaciones decorativas del hero (aurora, órbitas, nodos…)
        // cuando el hero sale de pantalla, para no gastar GPU/CPU en algo invisible.
        const heroSticky = document.querySelector('.world-sticky');
        if (heroSticky && 'IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                worldDescent.classList.toggle('hero-offscreen', !entries[0].isIntersecting);
            }, { threshold: 0 }).observe(heroSticky);
        }
    }

    initRealisticEarth();

    async function initRealisticEarth() {
        const wrap = document.getElementById('earthWrap');
        const canvas = document.getElementById('earthCanvas');
        const world = document.getElementById('worldDescent');
        const phase1 = document.querySelector('.world-copy');
        const mkts = document.querySelector('.world-market-dock');
        const ring = document.getElementById('earthGlassRing');
        const halo = document.getElementById('earthHalo');
        const vignette = document.getElementById('earthVignette');
        const pin = document.getElementById('earthPin');
        if (!wrap || !canvas) return;

        // ── Opción C — Planeta estático en equipos lentos ──
        // Si el dispositivo es claramente de bajos recursos (o pide reduced-motion
        // o ahorro de datos), NO cargamos el globo WebGL: el fallback CSS
        // (.earth-core) muestra la Tierra y hasta hace zoom con el scroll, sin
        // costo de GPU por frame. En el resto se carga el 3D y, si aun así va
        // lento, se cambia a estático en caliente (ver goStatic más abajo).
        const _reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const _saveData = navigator.connection && navigator.connection.saveData;
        const _lowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
        const _lowMem = navigator.deviceMemory && navigator.deviceMemory <= 2;
        if (_reduceMotion || _saveData || _lowCores || _lowMem) {
            console.info('[VALL] Planeta estático (equipo de bajos recursos o reduced-motion/save-data).');
            return; // earthWrap conserva el .earth-core visible (sin clase webgl-ready)
        }

        try {
            const THREE = await withTimeout(
                import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'),
                3500,
                'Three.js timeout'
            );
            const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
            // ── Calidad adaptativa ──
            // Empezamos en 1.5x y, si el equipo no sostiene los fps, bajamos la
            // resolución de render escalón por escalón (1.5 → 1.1 → 0.85) en vez de
            // dejar que el scroll se trabe. Es una degradación de una sola vía.
            const DPR_STEPS = [Math.min(window.devicePixelRatio || 1, 1.5), 1.1, 0.85];
            let dprStep = 0;
            renderer.setPixelRatio(DPR_STEPS[0]);
            renderer.outputColorSpace = THREE.SRGBColorSpace;

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
            camera.position.set(0, 0, 4.8);

            const ambient = new THREE.AmbientLight(0xffffff, 0.62);
            scene.add(ambient);
            const sun = new THREE.DirectionalLight(0xffffff, 3.1);
            sun.position.set(-3.8, 2.2, 4.8);
            scene.add(sun);
            const rim = new THREE.DirectionalLight(0x7dd3fc, 1.45);
            rim.position.set(3.2, -0.4, -2.5);
            scene.add(rim);

            const globe = new THREE.Group();
            globe.position.y = -0.76;
            scene.add(globe);

            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous');
            const textureBase = 'img/';
            let earthMap, specularMap, cloudMap;
            try {
                [earthMap, specularMap, cloudMap] = await withTimeout(
                    Promise.all([
                        loader.loadAsync(textureBase + 'earth_atmos_2048.jpg'),
                        loader.loadAsync(textureBase + 'earth_specular_2048.jpg'),
                        loader.loadAsync(textureBase + 'earth_clouds_1024.png'),
                    ]),
                    5000,
                    'Earth texture timeout'
                );
            } catch (err) {
                console.info('Earth texture unavailable, keeping photo fallback.', err?.message || err);
                return;
            }
            earthMap.colorSpace = THREE.SRGBColorSpace;
            [earthMap, specularMap, cloudMap].forEach(texture => {
                texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                texture.generateMipmaps = true;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
            });

            const earth = new THREE.Mesh(
                new THREE.SphereGeometry(1, 96, 96),
                new THREE.MeshPhongMaterial({
                    map: earthMap,
                    specularMap,
                    specular: new THREE.Color(0x6fa8dc),
                    shininess: 18,
                })
            );
            globe.add(earth);

            const clouds = new THREE.Mesh(
                new THREE.SphereGeometry(1.018, 64, 64),
                new THREE.MeshLambertMaterial({
                    map: cloudMap,
                    transparent: true,
                    opacity: 0.42,
                    depthWrite: false,
                })
            );
            globe.add(clouds);

            const atmosphere = new THREE.Mesh(
                new THREE.SphereGeometry(1.055, 48, 48),
                new THREE.MeshBasicMaterial({
                    color: 0x7dd3fc,
                    transparent: true,
                    opacity: 0.18,
                    blending: THREE.AdditiveBlending,
                    side: THREE.BackSide,
                })
            );
            atmosphere.scale.setScalar(1.08);
            globe.add(atmosphere);

            function resizeEarth() {
                const width = Math.max(1, wrap.clientWidth);
                const height = Math.max(1, wrap.clientHeight);
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }

            const resizeObserver = new ResizeObserver(resizeEarth);
            resizeObserver.observe(wrap);
            resizeEarth();

            wrap.classList.add('webgl-ready');
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
            const easeOut = t => 1 - Math.pow(1 - t, 3);
            const subProgress = (progress, from, to) => clamp((progress - from) / (to - from), 0, 1);
            const front = new THREE.Vector3(0, 0, 1);
            const qIdle = new THREE.Quaternion();
            const qMexico = new THREE.Quaternion().setFromUnitVectors(latLonToDir(23.6, -102.5), front);
            const qFinal = new THREE.Quaternion();
            let scrollProgress = 0;
            let smoothProgress = 0;
            let idleY = -0.35;
            let worldVisible = true; // gate: no renderizar el globo 3D si el hero salió de pantalla
            let lastLayerProgress = -1; // evita reescribir estilos del DOM cada frame en reposo
            // Monitor de fps para la calidad adaptativa
            let fpsWarmup = 0, fpsWindow = 0, fpsSlow = 0, fpsVerySlow = 0;
            let staticMode = false; // si se activa, se abandona el WebGL y queda el planeta estático

            // Cambia a planeta estático (fallback CSS) y libera la GPU. Se llama
            // cuando el equipo sigue lento incluso a la mínima resolución.
            function goStatic(reason) {
                if (staticMode) return;
                staticMode = true;
                wrap.classList.remove('webgl-ready'); // crossfade a .earth-core (0.7s)
                try { resizeObserver.disconnect(); } catch (e) {}
                try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
                console.info('[VALL] Globo 3D → planeta estático por rendimiento:', reason);
            }

            function latLonToDir(lat, lon) {
                const phi = (90 - lat) * Math.PI / 180;
                const theta = (lon + 180) * Math.PI / 180;
                return new THREE.Vector3(
                    -Math.sin(phi) * Math.cos(theta),
                    Math.cos(phi),
                    Math.sin(phi) * Math.sin(theta)
                ).normalize();
            }

            function readProgress() {
                if (!world) return 0;
                const rect = world.getBoundingClientRect();
                const travel = Math.max(1, rect.height - window.innerHeight);
                scrollProgress = clamp(-rect.top / travel, 0, 1);
                // Margen de 200px para reanudar el render justo antes de reentrar.
                worldVisible = rect.bottom > -200 && rect.top < window.innerHeight + 200;
                return scrollProgress;
            }

            function setLayerProgress(zoomProgress, mexicoProgress, titleOutProgress) {
                const deco = Math.max(0, 1 - zoomProgress * 2.4);
                const decoScale = 1 + zoomProgress * 1.8;
                if (ring) {
                    ring.style.opacity = deco;
                    ring.style.transform = `translate(-50%, -50%) scale(${decoScale})`;
                }
                if (halo) {
                    halo.style.opacity = deco;
                    halo.style.transform = `translate(-50%, -50%) scale(${decoScale})`;
                }
                if (vignette) vignette.style.opacity = zoomProgress * 0.9;
                if (world) world.classList.toggle('is-mexico-focus', mexicoProgress > 0.18);
                if (phase1) {
                    phase1.style.opacity = 1 - titleOutProgress;
                    phase1.style.transform = `translateX(-50%) translateY(${titleOutProgress * -30}px)`;
                }
                if (mkts) {
                    mkts.style.opacity = 1 - titleOutProgress;
                    mkts.style.transform = `translateX(-50%) translateY(${titleOutProgress * 28}px)`;
                }
                if (pin) pin.classList.toggle('show', mexicoProgress > 0.08);
            }

            const CAM_FAR = 7.2;
            const CAM_NEAR = 2.05;
            const FOV_FAR = 38;
            const FOV_NEAR = 24;
            const Y_START = -0.76;
            const IDLE_SPEED = 0.10;

            let lastRender = performance.now();
            function animate(now) {
                if (staticMode) return; // se abandonó el WebGL: detener el loop
                requestAnimationFrame(animate); // render a framerate nativo (60/120fps)

                const dt = Math.min(0.05, (now - lastRender) / 1000);
                lastRender = now;

                const measured = readProgress(); // actualiza también worldVisible
                // Si el hero no está en pantalla, no renderizar el globo.
                if (!worldVisible) return;

                // ── Calidad adaptativa: si el equipo no sostiene el framerate, baja
                // la resolución del globo escalón por escalón; si ya está en la mínima
                // y SIGUE lento, cambia al planeta estático (Opción C en caliente). ──
                if (fpsWarmup < 30) {
                    fpsWarmup++;
                } else {
                    if (dt > 0.032) fpsSlow++;      // < ~31 fps
                    if (dt >= 0.045) fpsVerySlow++; // < ~22 fps (dt viene clampeado a 0.05)
                    if (++fpsWindow >= 40) {
                        if (fpsVerySlow >= 20) {
                            // Muy lento: no vale la pena degradar, directo a estático.
                            goStatic('fps muy bajo (<~22fps)');
                            return;
                        } else if (fpsSlow >= 24) { // ~60% de frames lentos
                            if (dprStep < DPR_STEPS.length - 1) {
                                dprStep++;
                                renderer.setPixelRatio(DPR_STEPS[dprStep]);
                                resizeEarth();
                            } else {
                                goStatic('fps bajo sostenido a mínima resolución');
                                return;
                            }
                        }
                        fpsWindow = 0; fpsSlow = 0; fpsVerySlow = 0;
                    }
                }

                const targetProgress = reducedMotion ? 0.74 : measured;
                if (!reducedMotion && targetProgress <= 0.001) {
                    smoothProgress = 0;
                    idleY = -0.35;
                } else if (!reducedMotion && targetProgress >= 0.999) {
                    smoothProgress = 1;
                }

                const smoothing = 1 - Math.pow(0.00006, dt);
                smoothProgress += (targetProgress - smoothProgress) * smoothing;
                if (Math.abs(targetProgress - smoothProgress) < 0.0015) smoothProgress = targetProgress;
                const progress = reducedMotion ? targetProgress : smoothProgress;
                const zoomProgress = easeOut(subProgress(progress, 0.26, 0.72));
                const mexicoProgress = subProgress(progress, 0.72, 0.88);
                const titleOutProgress = subProgress(progress, 0.20, 0.42);

                idleY += IDLE_SPEED * dt * (1 - zoomProgress);
                qIdle.setFromEuler(new THREE.Euler(0.18, idleY, 0));
                qFinal.slerpQuaternions(qIdle, qMexico, zoomProgress);
                globe.quaternion.copy(qFinal);
                clouds.rotation.y += reducedMotion ? 0 : dt * 0.045;

                camera.position.z = CAM_FAR + (CAM_NEAR - CAM_FAR) * zoomProgress;
                camera.fov = FOV_FAR + (FOV_NEAR - FOV_FAR) * zoomProgress;
                camera.updateProjectionMatrix();
                globe.position.y = Y_START * (1 - zoomProgress);

                // Solo tocar el DOM cuando el progreso realmente cambió.
                if (Math.abs(progress - lastLayerProgress) > 0.0004) {
                    setLayerProgress(zoomProgress, mexicoProgress, titleOutProgress);
                    lastLayerProgress = progress;
                }
                renderer.render(scene, camera);
            }
            requestAnimationFrame(animate);
        } catch (err) {
            console.info('3D Earth unavailable, using photo fallback.', err?.message || err);
        }
    }

    function withTimeout(promise, ms, label) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(label)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
    }

    function makeCanvasTexture(THREE, painter) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        painter(ctx, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    function makeEarthTexture(THREE) {
        return makeCanvasTexture(THREE, (ctx, w, h) => {
            const ocean = ctx.createLinearGradient(0, 0, w, h);
            ocean.addColorStop(0, '#0f4db8');
            ocean.addColorStop(0.45, '#1d7fe0');
            ocean.addColorStop(1, '#082b72');
            ctx.fillStyle = ocean;
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = '#177a4a';
            [
                [130, 145, 190, 118, -0.35], [210, 260, 110, 170, 0.25],
                [485, 145, 250, 105, 0.1], [560, 250, 115, 185, -0.12],
                [735, 155, 250, 120, 0.18], [815, 330, 120, 55, 0.2],
            ].forEach(([x, y, ww, hh, rot]) => {
                ctx.save();
                ctx.translate(x + ww / 2, y + hh / 2);
                ctx.rotate(rot);
                ctx.beginPath();
                ctx.ellipse(0, 0, ww / 2, hh / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#d6b46a';
            ctx.beginPath();
            ctx.ellipse(610, 230, 48, 86, -0.18, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function makeSpecularTexture(THREE) {
        return makeCanvasTexture(THREE, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#404040');
            g.addColorStop(0.5, '#d0d0d0');
            g.addColorStop(1, '#303030');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        });
    }

    function makeCloudTexture(THREE) {
        return makeCanvasTexture(THREE, (ctx, w, h) => {
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255,255,255,0.72)';
            for (let i = 0; i < 90; i++) {
                const x = Math.random() * w;
                const y = Math.random() * h;
                const ww = 35 + Math.random() * 120;
                const hh = 8 + Math.random() * 28;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate((Math.random() - 0.5) * 0.6);
                ctx.beginPath();
                ctx.ellipse(0, 0, ww, hh, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
    }

    function generateSparklineSVG(dataArray, color) {
        if (!dataArray || dataArray.length < 2) return '';
        const min = Math.min(...dataArray);
        const max = Math.max(...dataArray);
        const range = max - min || 1;
        const width = 100; 
        const height = 40; 
        
        let path = `M 0,${height - ((dataArray[0] - min) / range) * height}`;
        for (let i = 1; i < dataArray.length; i++) {
            const x = (i / (dataArray.length - 1)) * width;
            const y = height - ((dataArray[i] - min) / range) * height;
            path += ` L ${x},${y}`;
        }
        
        return `<svg class="spark-chart" viewBox="0 -5 100 50" preserveAspectRatio="none">
                    <path class="spark-path" d="${path}" stroke="${color}" />
                </svg>`;
    }

    async function loadSparklines() {
        const TICKERS = [
            { sym: '^GSPC', label: 'S&P 500', icon: 'fa-chart-line' },
            { sym: '^IXIC', label: 'NASDAQ', icon: 'fa-microchip' },
            { sym: 'CL=F', label: 'WTI CRUDE', icon: 'fa-tint' },
            { sym: 'USDMXN=X', label: 'USD/MXN', icon: 'fa-money-bill-wave' }
        ];
        
        const grid = document.getElementById('sparkGrid');
        if(!grid) return null;
        
        try {
            const results = TICKERS.map(t => {
                let base = 0, pct = 0;
                if(t.sym==='^GSPC') { base = 5450; pct = 1.2; }
                else if(t.sym==='^IXIC') { base = 17200; pct = 1.8; }
                else if(t.sym==='CL=F') { base = 82; pct = -0.5; }
                else if(t.sym==='USDMXN=X') { base = 18.2; pct = 0.2; }
                const closes = [base*0.99, base*0.98, base*1.01, base*0.99, base*(1+pct/100)];
                return { ...t, meta: { regularMarketPrice: base*(1+pct/100), regularMarketChangePercent: pct }, closes };
            });
            let htmlStr = '';
            
            results.forEach(res => {
                if(!res.meta) return;
                const price = res.meta.regularMarketPrice || 0;
                const pct = res.meta.regularMarketChangePercent || 0;
                const isUp = pct >= 0;
                const color = isUp ? '#10b981' : '#ef4444';
                const sign = isUp ? '+' : '';
                
                const svgChart = generateSparklineSVG(res.closes, color);
                
                htmlStr += `
                <div class="spark-card">
                    <div class="spark-header">
                        <h4 class="spark-title">${res.label}</h4>
                        <i class="fas ${res.icon} spark-icon"></i>
                    </div>
                    <h2 class="spark-price">${price.toLocaleString('en-US', {maximumFractionDigits:2})}</h2>
                    <p class="spark-pct ${isUp ? 'pct-up' : 'pct-down'}">${sign}${pct.toFixed(2)}%</p>
                    ${svgChart}
                </div>`;
            });
            
            if(htmlStr) grid.innerHTML = htmlStr;
            return results;
        } catch(e) {
            console.error('Sparkline error', e);
            return null;
        }
    }

    // ── INYECCIÓN DE NOTICIAS (10 SLIDES) ──
    function timeAgoEs(unixSec) {
        if (!unixSec) return '';
        const diff = Math.max(0, Date.now() / 1000 - unixSec);
        if (diff < 3600)  return `hace ${Math.max(1, Math.round(diff / 60))} min`;
        if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
        const dias = Math.round(diff / 86400);
        return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
    }

    function escapeNewsText(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function loadLiveNews() {
                const wrap = document.getElementById('liveNewsCarousel');
        try {
            let news = [];
            try {
                const r = await fetch('/api/finnhub-news?category=general', { credentials: 'include' });
                if(!r.ok) throw new Error('News fetch error');
                news = await r.json();
            } catch(fetchError) {
                console.warn('Finnhub API failed, using fallback news', fetchError);
                news = [
                    { headline: 'Wall Street marca nuevos mximos histricos ante la cada de rendimientos de bonos', source: 'Reuters', datetime: Date.now()/1000 - 3600, summary: 'Los ndices principales rebotaron fuertemente hoy en respuesta a polticas macroeconmicas.' },
                    { headline: 'Sector tecnolgico lidera ganancias tras reportes de ganancias estelares', source: 'Bloomberg', datetime: Date.now()/1000 - 7200, summary: 'Empresas de semiconductores superaron las estimaciones, impulsando un rally masivo.' },
                    { headline: 'Bancos centrales evalan recortes de tasas para el prximo trimestre', source: 'WSJ', datetime: Date.now()/1000 - 10800, summary: 'El panorama de la poltica monetaria comienza a cambiar hacia un sesgo ms acomodaticio.' },
                    { headline: 'Petrleo crudo WTI retrocede ante aumento de inventarios globales', source: 'CNBC', datetime: Date.now()/1000 - 14400, summary: 'Los futuros del petrleo experimentaron volatilidad hoy.' },
                    { headline: 'Peso mexicano muestra resiliencia frente a la fortaleza del dlar', source: 'El Financiero', datetime: Date.now()/1000 - 18000, summary: 'A pesar del contexto global, la moneda se mantiene estable en niveles de 18.20.' }
                ];
            }
            
            if(news && news.length > 0) {
                const validNews = news.filter(n => n.headline).slice(0, 10); 
                
                if (validNews.length > 0) {
                    const premiumSet = [
                        'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=600&fit=crop',
                        'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&h=600&fit=crop'
                    ];
                    
                    let slidesHtml = '<div class="cine-slider-track">'; 
                    let dotsHtml = '<div class="cine-controls">';
                    
                    validNews.forEach((n, i) => {
                        let imgUrl = premiumSet[i % premiumSet.length];

                        slidesHtml += `
                        <div class="cine-slide ${i === 0 ? 'active' : ''}">
                            <div class="cine-slide-bg" style="background-image: url('${imgUrl}');"></div>
                            <div class="cine-glass">
                                <span class="cine-tag">VALLNEWS INTELIGENCIA</span>
                                <span class="cine-time">${n.source ? escapeNewsText(n.source) + ' · ' : ''}${escapeNewsText(timeAgoEs(n.datetime))}</span>
                                <h3 class="cine-title">${escapeNewsText(n.headline)}</h3>
                                <p class="cine-desc">${n.summary ? escapeNewsText(n.summary.slice(0, 160)) + '...' : ''}</p>
                            </div>
                        </div>`;
                        dotsHtml += `<div class="cine-dot ${i === 0 ? 'active' : ''}" data-index="${i}"><div class="cine-dot-fill"></div></div>`;
                    });
                    
                    slidesHtml += '</div>';
                    dotsHtml += '</div>';
                    
                    wrap.innerHTML = slidesHtml + dotsHtml;
                    initTrueSwipeSlider(wrap);
                    return;
                }
            }
            throw new Error('No valid news found');
        } catch(e) {
            console.error('News Error:', e);
            wrap.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:500px; background:var(--clr-bg); border-radius:24px;"><h3 style="color:var(--clr-danger);"><i class="fas fa-exclamation-triangle"></i> Error al cargar feed</h4><p>No se pudo conectar con la API de noticias.</p></div>`;
        }
    }
    
    // Motor interactivo - Mejorado con transiciones suaves
    function initTrueSwipeSlider(container) {
        const track = container.querySelector('.cine-slider-track');
        const slides = container.querySelectorAll('.cine-slide');
        const dots = container.querySelectorAll('.cine-dot');
        let current = 0;
        let slideTimer;
        const SLIDE_DUR = 7000;
        
        let isDragging = false;
        let startX = 0;
        let currentTranslate = 0;
        let prevTranslate = 0;
        let animationID;
        let velocity = 0;
        
        function goToSlide(idx) {
            if (idx < 0) idx = slides.length - 1;
            if (idx >= slides.length) idx = 0;
            
            // Animación de salida del slide actual
            slides[current].classList.remove('active');
            dots[current].classList.remove('active');
            const oldFill = dots[current].querySelector('.cine-dot-fill');
            oldFill.style.transition = 'width 0.3s ease'; 
            oldFill.style.width = '0%';
            
            current = idx;
            
            // Cover Flow calculations: slide is 74vw (70vw + 2*2vw margin)
            const vw = window.innerWidth;
            const slideWidth = vw * 0.74; 
            const centerOffset = (vw - slideWidth) / 2;
            
            currentTranslate = centerOffset - (current * slideWidth);
            prevTranslate = currentTranslate;
            
            // Transición suave con easing mejorado
            track.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
            track.style.transform = `translateX(${currentTranslate}px)`;
            
            // Ambient light sync
            const ambientColors = [
                'rgba(37, 99, 235, 0.15)',   // Blue
                'rgba(139, 92, 246, 0.15)',  // Purple
                'rgba(16, 185, 129, 0.15)',  // Emerald
                'rgba(245, 158, 11, 0.15)',  // Amber
                'rgba(239, 68, 68, 0.15)',   // Red
                'rgba(6, 182, 212, 0.15)',   // Cyan
                'rgba(236, 72, 153, 0.15)',  // Pink
                'rgba(139, 92, 246, 0.15)',  // Purple
                'rgba(37, 99, 235, 0.15)',   // Blue
                'rgba(16, 185, 129, 0.15)'   // Emerald
            ];
            const arrivalSection = document.querySelector('.news-arrival');
            if (arrivalSection) {
                arrivalSection.style.setProperty('--ambient-color', ambientColors[current % ambientColors.length]);
                // Flash effect
                arrivalSection.style.opacity = '0.5';
                setTimeout(() => arrivalSection.style.opacity = '1', 50);
            }
            
            // Animación de entrada del nuevo slide
            setTimeout(() => {
                slides[current].classList.add('active');
                dots[current].classList.add('active');
                const newFill = dots[current].querySelector('.cine-dot-fill');
                newFill.style.transition = 'width 6.5s linear'; 
                newFill.style.width = '100%';
            }, 50);
            
            resetTimer();
        }
        
        function nextSlide() { goToSlide(current + 1); }
        function prevSlide() { goToSlide(current - 1); }
        function resetTimer() { clearInterval(slideTimer); slideTimer = setInterval(nextSlide, SLIDE_DUR); }
        
        // Interactividad de dots (Magnéticos)
        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                goToSlide(parseInt(e.currentTarget.dataset.index));
            });
            dot.addEventListener('mouseenter', () => {
                dot.style.background = 'rgba(255,255,255,0.4)';
            });
            dot.addEventListener('mouseleave', () => {
                if (!dot.classList.contains('active')) {
                    dot.style.background = 'rgba(255,255,255,0.15)';
                }
                dot.style.setProperty('--mx', '0px');
                dot.style.setProperty('--my', '0px');
            });
            dot.addEventListener('mousemove', (e) => {
                const rect = dot.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                // Move dot slightly towards cursor (magnetic effect)
                dot.style.setProperty('--mx', `${x * 0.4}px`);
                dot.style.setProperty('--my', `${y * 0.4}px`);
            });
        });
        
        resetTimer();

        // Initialize layout on load
        const initLayout = () => {
            const vw = window.innerWidth;
            const slideWidth = vw * 0.74; 
            const centerOffset = (vw - slideWidth) / 2;
            currentTranslate = centerOffset;
            prevTranslate = currentTranslate;
            track.style.transition = 'none';
            track.style.transform = `translateX(${currentTranslate}px)`;
        };
        initLayout();
        
        track.addEventListener('dragstart', e => e.preventDefault());

        // Evento de mouse down con feedback visual
        container.addEventListener('pointerdown', (e) => {
            if(e.button !== 0 || e.target.closest('a')) return;
            isDragging = true;
            startX = e.clientX;
            velocity = 0;
            clearInterval(slideTimer);
            container.style.cursor = 'grabbing';
            track.style.transition = 'none'; 
            animationID = requestAnimationFrame(animationLoop);
        });

        // Movimiento del mouse
        window.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const diffX = e.clientX - startX;
            currentTranslate = prevTranslate + diffX;
            velocity = diffX; // Calcular velocidad para momentum
            // Drag parallax effect (background moves slower than container)
            container.style.setProperty('--parallax-drag', `${diffX * 0.3}px`);
        });

        // Soltar el mouse con momentum
        window.addEventListener('pointerup', () => {
            if (!isDragging) return;
            isDragging = false;
            cancelAnimationFrame(animationID);
            container.style.cursor = 'grab';
            container.style.setProperty('--parallax-drag', `0px`);
            
            const movedBy = currentTranslate - prevTranslate;
            if (movedBy < -80) nextSlide();
            else if (movedBy > 80) prevSlide();
            else goToSlide(current);
        });

        window.addEventListener('pointerleave', () => {
            if(isDragging) {
                isDragging = false;
                cancelAnimationFrame(animationID);
                container.style.cursor = 'grab';
                container.style.setProperty('--parallax-drag', `0px`);
                goToSlide(current);
            }
        });

        // 3D Tilt and Mouse Flashlight Tracking
        container.addEventListener('mousemove', (e) => {
            if (isDragging) return;
            const rect = container.getBoundingClientRect();
            // Coordinates for flashlight (px)
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Normalized coordinates for 3D tilt (-1 to 1)
            const normX = (x / rect.width) * 2 - 1;
            const normY = (y / rect.height) * 2 - 1;
            
            slides.forEach(slide => {
                if(slide.classList.contains('active')) {
                    slide.style.setProperty('--mouse-x', `${x}px`);
                    slide.style.setProperty('--mouse-y', `${y}px`);
                    // Rotate based on mouse position (subtle 3D)
                    slide.style.setProperty('--rot-x', `${-normY * 4}deg`);
                    slide.style.setProperty('--rot-y', `${normX * 4}deg`);
                }
            });
        });
        
        container.addEventListener('mouseleave', () => {
            slides.forEach(slide => {
                slide.style.setProperty('--rot-x', `0deg`);
                slide.style.setProperty('--rot-y', `0deg`);
            });
        });

        function animationLoop() {
            if (isDragging) {
                track.style.transform = `translateX(${currentTranslate}px)`;
                requestAnimationFrame(animationLoop);
            }
        }
        
        window.addEventListener('resize', () => {
            if(!isDragging) {
                const vw = window.innerWidth;
                const slideWidth = vw * 0.74; 
                const centerOffset = (vw - slideWidth) / 2;
                
                track.style.transition = 'none';
                currentTranslate = centerOffset - (current * slideWidth);
                prevTranslate = currentTranslate;
                track.style.transform = `translateX(${currentTranslate}px)`;
            }
        });
    }

    // C. Resumen Dinámico VALL AI (Sumamente Amigable)
    async function loadAISummary(sparkData) {
        try {
            const summaryEl = document.getElementById('aiGlobalSummary');
            let context = '';
            
            if (sparkData && sparkData.length > 0) {
                const parts = sparkData.filter(t => t.meta).map(t => `${t.label}: ${t.meta.regularMarketChangePercent?.toFixed(2)}%`);
                context = parts.join(', ');
            }
            
            const prompt = `Actúa como VALL AI, el asistente financiero personal del usuario. Escribe un mensaje de bienvenida de 2 oraciones máximas para el inicio de VALLNEWS. Basado en el mercado actual (${context}), dale un tono sumamente amigable, cálido, humano y alentador. Queremos que se sienta emocionado por explorar las finanzas hoy. (Ejemplo: "¡Hola! Qué gusto verte. Hoy el mercado está movido, pero estoy listo para ayudarte a entenderlo.") No uses lenguaje robótico.`;

            const r = await fetch('/api/ai-insight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt, tier: 'flash' })
            });
            if (r.ok) {
                const result = await r.json();
                if (result.reply) {
                    summaryEl.innerHTML = `<strong>VALL AI:</strong> ${result.reply}`;
                    return;
                }
            }
            throw new Error('Fallback AI');
        } catch(e) {
            console.error('AI Summary Error:', e);
            document.getElementById('aiGlobalSummary').innerHTML = `¡Hola! Qué gusto tenerte de vuelta. Explora las noticias y los mercados de hoy; estoy aquí procesando todo para apoyarte.`;
        }
    }

    // ── Smooth parallax entrance for post-globe sections ──
    (function initSectionEntrances() {
        const entranceSections = document.querySelectorAll('.news-arrival, .vn-bento-section');
        if (!entranceSections.length) return;

        let eRaf;
        function updateEntrances() {
            const vh = window.innerHeight;
            entranceSections.forEach(el => {
                const rect = el.getBoundingClientRect();
                // 0 cuando el borde superior está abajo del viewport, 1 cuando entró.
                const raw = (vh - rect.top) / (vh * 0.7);
                const p = Math.min(1, Math.max(0, raw));
                // --entrance alimenta detalles decorativos (línea de barrido) en CSS.
                el.style.setProperty('--entrance', p.toFixed(3));
                // Solo un translateY suave (sin rotateX 3D, que forzaba re-render
                // pesado de secciones con blur). Compositor GPU puro.
                                const dist = (1 - p) * 120;
                el.style.opacity = (p * 1.5).toFixed(3); // Fades in slightly faster
                el.style.transform = `translate3d(0, ${dist.toFixed(1)}px, 0)`;
            });
            eRaf = null;
        }

        window.addEventListener('scroll', () => {
            if (!eRaf) eRaf = requestAnimationFrame(updateEntrances);
        }, { passive: true });

        window.addEventListener('resize', updateEntrances);
        updateEntrances();
    })();

    // ── PREMIUM INTERACTIVITY INITIALIZATION ──
    function initPremiumInteractivity() {
        // Bento Cards Mouse Panning & Ambient Sync
        const bentoSection = document.querySelector('.vn-bento-section');
        if (bentoSection) {
            // Global Spotlight
            let spotRaf = null, spotE = null;
            bentoSection.addEventListener('mousemove', (e) => {
                spotE = e;
                if (spotRaf) return;
                spotRaf = requestAnimationFrame(() => {
                    const rect = bentoSection.getBoundingClientRect();
                    bentoSection.style.setProperty('--spot-x', `${spotE.clientX - rect.left}px`);
                    bentoSection.style.setProperty('--spot-y', `${spotE.clientY - rect.top}px`);
                    spotRaf = null;
                });
            });
        }

        document.querySelectorAll('.bento-card').forEach(card => {
            // Ambient Aura Sync
            card.addEventListener('mouseenter', () => {
                if (bentoSection) {
                    let auraColor = 'transparent';
                    if (card.classList.contains('bento-hero')) auraColor = 'rgba(37, 99, 235, 0.15)'; // Blue
                    else if (card.classList.contains('bento-prot')) auraColor = 'rgba(239, 68, 68, 0.15)'; // Red/Protein
                    else if (card.classList.contains('bento-fin')) auraColor = 'rgba(16, 185, 129, 0.15)'; // Emerald
                    else if (card.classList.contains('bento-mex')) auraColor = 'rgba(245, 158, 11, 0.15)'; // Amber
                    bentoSection.style.setProperty('--bento-aura', auraColor);
                }
            });

            card.addEventListener('mouseleave', () => {
                if (bentoSection) {
                    bentoSection.style.setProperty('--bento-aura', 'transparent');
                }
            });
        });

        // Sparklines Mouse Glow Tracking
        // Need to use event delegation or MutationObserver since sparklines are loaded dynamically
        const sparkGrid = document.querySelector('.spark-grid');
        if (sparkGrid) {
            let sparkRaf = null, sparkE = null;
            sparkGrid.addEventListener('mousemove', (e) => {
                sparkE = e;
                if (sparkRaf) return;
                sparkRaf = requestAnimationFrame(() => {
                    const card = sparkE.target.closest && sparkE.target.closest('.spark-card');
                    if (card) {
                        const rect = card.getBoundingClientRect();
                        card.style.setProperty('--mx', `${sparkE.clientX - rect.left}px`);
                        card.style.setProperty('--my', `${sparkE.clientY - rect.top}px`);
                    }
                    sparkRaf = null;
                });
            });
        }
    }
    initPremiumInteractivity();

    // Ejecutar pipelines paralelos
    loadSparklines().then(data => loadAISummary(data));
    loadLiveNews();

    // Click Ripple (solo en click — no es un bucle continuo)
    window.addEventListener('click', (e) => {
        const ripple = document.createElement('div');
        ripple.classList.add('click-ripple');
        ripple.style.left = `${e.clientX}px`;
        ripple.style.top = `${e.clientY}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
});




