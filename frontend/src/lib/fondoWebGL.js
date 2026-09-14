/*
 * Fondo animado de la cabecera de Inicio, en WebGL crudo.
 *
 * POR QUÉ WEBGL Y NO CSS
 * El degradado cónico animado que había antes movía una capa enorme con
 * `transform` en cada fotograma: barato de escribir, caro de componer, y el
 * resultado es siempre la misma forma girando. Aquí el color se calcula por
 * píxel en la GPU, así que la nube se deforma de verdad y no cuesta nada al
 * hilo principal.
 *
 * SIN LIBRERÍAS A PROPÓSITO
 * Son ~40 líneas de WebGL 1 y un shader. Meter three.js por esto serían cientos
 * de KB para dibujar un triángulo, y el CSP de este proyecto no quiere CDNs.
 *
 * LO QUE HAY QUE RESPETAR AL TOCARLO
 * - `prefers-reduced-motion`: se pinta UN fotograma y se para el bucle. No se
 *   deja de pintar (el fondo debe existir), simplemente no se mueve.
 * - Si `getContext('webgl')` falla —máquina sin GPU, contexto perdido, headless
 *   sin swiftshader— esto devuelve null y el canvas se queda transparente. El
 *   degradado CSS de `.in-masthead` sigue debajo, así que la página se ve bien
 *   igual: el WebGL es una capa de más, nunca el fondo único.
 * - El búfer se limita a 1.5x de densidad y 1600 px de ancho. Sin el tope, una
 *   pantalla 4K a dpr 2 pide 7680 px de fragmentos para un adorno.
 */

const VERT = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }
`;

/* Trozo común a las dos variantes: ruido de valor con hash aritmético (no hay
   texturas que cargar) y fbm de 5 octavas. */
const RUIDO = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * ruido(p); p *= 2.02; a *= 0.5; }
  return v;
}
`;

/* Variante `nube` (cabecera de Inicio). Los dos campos de fbm se usan para
   cosas distintas: `nube` mueve la masa azul y `veta` decide dónde asoma el oro,
   para que el dorado no sea una capa plana encima sino que salga de dentro de la
   propia nube. */
const FRAG_NUBE = `
precision mediump float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPtr;
${RUIDO}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p  = uv;
  p.x *= uRes.x / uRes.y;

  float t = uTime * 0.028;
  vec2 desvio = uPtr * 0.06;

  // Advección: el campo se desplaza consigo mismo, que es lo que da la
  // sensación de corriente en vez de la de un patrón que se arrastra.
  vec2 q = vec2(fbm(p * 1.35 + vec2(t, t * 0.6)), fbm(p * 1.35 + vec2(4.3, 1.7) - t * 0.8));
  float nube = fbm(p * 1.9 + q * 1.25 + desvio + vec2(0.0, t * 0.5));
  float veta = fbm(p * 2.7 - q * 0.9 + vec2(t * 0.7, 0.0));

  vec3 fondo = vec3(0.055, 0.105, 0.161);   // #0e1b29
  vec3 azul  = vec3(0.113, 0.298, 0.470);   // #1d4c78
  vec3 cian  = vec3(0.196, 0.514, 0.729);   // #3283ba
  vec3 oro   = vec3(0.882, 0.682, 0.322);   // #e1ae52

  vec3 col = mix(fondo, azul, smoothstep(0.28, 0.86, nube));
  col = mix(col, cian, smoothstep(0.58, 0.95, nube) * 0.55);
  col += oro * smoothstep(0.72, 0.99, veta) * 0.13;

  // Retícula fina: es lo que lo ata al lenguaje de "instrumento" del resto de
  // la página. Se atenúa hacia la izquierda para no competir con el titular.
  vec2 rej = abs(fract(uv * vec2(46.0, 26.0)) - 0.5);
  float linea = 1.0 - smoothstep(0.0, 0.03, min(rej.x, rej.y));
  col += vec3(0.42, 0.62, 0.82) * linea * 0.045 * smoothstep(0.15, 0.9, uv.x);

  // Barrido lento de luz, en diagonal.
  float barrido = smoothstep(0.0, 1.0, sin((uv.x * 1.4 + uv.y * 0.6 - uTime * 0.07) * 3.14159));
  col += vec3(0.30, 0.52, 0.74) * barrido * 0.05;

  // Viñeta: oscurece la izquierda-abajo, que es donde va el texto.
  float vin = smoothstep(1.15, 0.12, length((uv - vec2(0.78, 0.86)) * vec2(1.0, 0.8)));
  col *= mix(0.62, 1.0, vin);

  // Grano: sin él los degradados de 5 octavas hacen bandas visibles en pantallas de 8 bits.
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.016;

  gl_FragColor = vec4(col, 1.0);
}
`;

/* Variante `rejilla` (login). Una retícula en perspectiva que se aleja hacia un
   horizonte, con niebla encima y una línea de luz en el corte.
   El truco de la perspectiva es una sola división: `z = 1/(horizonte - y)`.
   Cuanto más cerca del horizonte, mayor z, y por tanto más juntas salen las
   líneas — que es exactamente lo que hace la perspectiva de verdad. Avanzar
   sumando tiempo a esa coordenada da la sensación de estar desplazándose.
   Se mantiene MUY apagada a propósito: aquí encima va un formulario, y una
   retícula marcada convierte la pantalla en un salvapantallas. */
const FRAG_REJILLA = `
precision mediump float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPtr;
${RUIDO}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uRes.x / uRes.y;

  float t = uTime * 0.05;
  float horizonte = 0.16 + uPtr.y * 0.02;

  vec3 fondo = vec3(0.043, 0.086, 0.133);   // #0b1622
  vec3 azul  = vec3(0.125, 0.325, 0.510);   // #205382
  vec3 cian  = vec3(0.220, 0.545, 0.760);   // #388bc2
  vec3 oro   = vec3(0.882, 0.682, 0.322);   // #e1ae52

  vec3 col = fondo;

  // ── Cielo: niebla lenta por encima del horizonte ──
  if (p.y > horizonte - 0.02) {
    vec2 q = vec2(fbm(p * 1.1 + vec2(t, t * 0.5)), fbm(p * 1.1 + vec2(3.1, 1.3) - t * 0.7));
    float niebla = fbm(p * 1.5 + q * 1.1 + vec2(uPtr.x * 0.05, t * 0.4));
    float alto = smoothstep(horizonte - 0.02, 1.4, p.y);
    col = mix(col, azul, smoothstep(0.34, 0.92, niebla) * (1.0 - alto * 0.45));
    col = mix(col, cian, smoothstep(0.62, 0.98, niebla) * 0.32 * (1.0 - alto * 0.6));
  }

  // ── Suelo: retícula en perspectiva ──
  if (p.y < horizonte) {
    float d = horizonte - p.y;
    float z = 1.0 / max(d, 0.0012);
    vec2 g = vec2(p.x * z * 0.30 + uPtr.x * 0.25, z * 0.42 + t * 5.0);
    vec2 rej = abs(fract(g) - 0.5);
    // El ancho de línea crece con la distancia para que las lejanas no se
    // conviertan en ruido de submuestreo (moiré) al juntarse demasiado.
    float grosor = 0.028 + z * 0.0016;
    float linea = 1.0 - smoothstep(0.0, grosor, min(rej.x, rej.y));
    float lejos = exp(-z * 0.085);
    col += mix(azul, cian, 0.5) * linea * lejos * 1.15;
    col += fondo * 0.4 * (1.0 - lejos);
  }

  // ── Corte del horizonte: una línea de luz fina, con un punto de oro ──
  float corte = exp(-abs(p.y - horizonte) * 160.0);
  col += mix(cian, oro, 0.35) * corte * 0.5;
  col += cian * exp(-abs(p.y - horizonte) * 9.0) * 0.10;

  // Viñeta hacia las esquinas.
  col *= mix(0.55, 1.0, smoothstep(1.5, 0.15, length(p * vec2(0.62, 0.9))));

  // Grano: sin él los degradados hacen bandas visibles en pantallas de 8 bits.
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.018;

  gl_FragColor = vec4(col, 1.0);
}
`;

const VARIANTES = { nube: FRAG_NUBE, rejilla: FRAG_REJILLA };

function compilar(gl, tipo, fuente) {
  const sh = gl.createShader(tipo);
  gl.shaderSource(sh, fuente);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('fondoWebGL: shader no compila —', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/**
 * Arranca el fondo sobre un <canvas> ya montado.
 * @param {HTMLCanvasElement} canvas
 * @param {'nube'|'rejilla'} variante  qué escena pintar. Comparten todo el
 *   andamiaje (contexto, bucle, pausa, redimensionado) y solo cambia el shader:
 *   duplicar el módulo por una escena distinta serían 120 líneas repetidas.
 * @returns {() => void | null} función para detenerlo, o null si no hay WebGL.
 */
export default function iniciarFondo(canvas, variante = 'nube') {
  if (!canvas) return null;
  const FRAG = VARIANTES[variante] || FRAG_NUBE;

  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power', preserveDrawingBuffer: false,
  }) || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const vs = compilar(gl, gl.VERTEX_SHADER, VERT);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('fondoWebGL: no enlaza —', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // Un solo triángulo que cubre de sobra el clip space: dos menos que un quad,
  // y sin la costura diagonal que a veces se ve entre los dos del quad.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uPtr = gl.getUniformLocation(prog, 'uPtr');

  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ptr = { x: 0, y: 0 };
  const objetivo = { x: 0, y: 0 };
  let rafId = 0;
  let visible = true;
  let vivo = true;

  function medir() {
    const caja = canvas.getBoundingClientRect();
    if (!caja.width || !caja.height) return false;
    const densidad = Math.min(window.devicePixelRatio || 1, 1.5);
    const ancho = Math.min(Math.round(caja.width * densidad), 1600);
    const alto = Math.round(ancho * (caja.height / caja.width));
    if (canvas.width === ancho && canvas.height === alto) return true;
    canvas.width = ancho;
    canvas.height = alto;
    gl.viewport(0, 0, ancho, alto);
    return true;
  }

  function pintar(ms) {
    if (!medir()) return;
    // Suavizado del puntero: el salto directo del ratón se ve como un tirón.
    ptr.x += (objetivo.x - ptr.x) * 0.045;
    ptr.y += (objetivo.y - ptr.y) * 0.045;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, ms / 1000);
    gl.uniform2f(uPtr, ptr.x, ptr.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function bucle(ms) {
    if (!vivo) return;
    pintar(ms);
    rafId = requestAnimationFrame(bucle);
  }

  function arrancar() {
    if (!vivo || rafId) return;
    if (quieto.matches) { pintar(0); return; }   // un fotograma y nada más
    rafId = requestAnimationFrame(bucle);
  }
  function parar() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // Fuera de pantalla o pestaña en segundo plano: el bucle se detiene. Un
  // fragment shader a pantalla completa girando en una pestaña que nadie mira
  // es la forma más fácil de que un portátil se quede sin batería.
  const obs = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !document.hidden) arrancar(); else parar();
  }, { threshold: 0 });
  obs.observe(canvas);

  const alCambiarPestana = () => {
    if (document.hidden || !visible) parar(); else arrancar();
  };
  const alMover = (e) => {
    const c = canvas.getBoundingClientRect();
    objetivo.x = ((e.clientX - c.left) / c.width - 0.5) * 2;
    objetivo.y = ((e.clientY - c.top) / c.height - 0.5) * 2;
  };
  const alRedimensionar = () => { if (!rafId) pintar(performance.now()); };
  const alCambiarMovimiento = () => { parar(); arrancar(); };

  document.addEventListener('visibilitychange', alCambiarPestana);
  window.addEventListener('pointermove', alMover, { passive: true });
  window.addEventListener('resize', alRedimensionar, { passive: true });
  quieto.addEventListener?.('change', alCambiarMovimiento);

  // El contexto se pierde al dormir el equipo o al cambiar de GPU. Sin esto el
  // canvas se queda en negro para siempre; así vuelve al degradado CSS.
  const alPerderContexto = (e) => { e.preventDefault(); vivo = false; parar(); };
  canvas.addEventListener('webglcontextlost', alPerderContexto);

  arrancar();

  return () => {
    vivo = false;
    parar();
    obs.disconnect();
    document.removeEventListener('visibilitychange', alCambiarPestana);
    window.removeEventListener('pointermove', alMover);
    window.removeEventListener('resize', alRedimensionar);
    quieto.removeEventListener?.('change', alCambiarMovimiento);
    canvas.removeEventListener('webglcontextlost', alPerderContexto);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
