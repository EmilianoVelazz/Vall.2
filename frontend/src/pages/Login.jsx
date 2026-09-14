import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePageStyles from '../lib/usePageStyles.js';
import { apiGet, apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import iniciarFondo from '../lib/fondoWebGL.js';
import { useRevelado } from '../lib/animaInicio.js';
import { useContador, useTilt } from '../lib/animaLogin.js';
import './Login.css';

/*
 * Login — rediseño completo (2026-08-18).
 *
 * QUÉ SE FUE
 * La versión anterior era «panel de marca + tarjeta»: un titular, un párrafo y
 * una lista de cinco secciones con una píldora de dato colgando a la derecha.
 * Los datos reales que ya se pedían a las APIs iban de adorno, en letra de 10 px
 * al final de cada fila. Ahora esos cuatro datos SON el panel izquierdo: un
 * tablero en vivo con las cifras en grande, que es lo que promete el producto y
 * lo único de esta pantalla que no es texto fijo.
 *
 * HOJA PROPIA
 * Antes compartía `assets/css/login.css` con el `index.html` heredado, así que
 * rehacer la estructura habría roto esa página. Ahora esta pantalla tiene su
 * `Login.css` con prefijo `lg-` y el heredado se queda con su hoja intacta.
 *
 * LO QUE SE ANIMA, Y POR QUÉ
 * Fondo WebGL (variante `rejilla`: un horizonte en perspectiva), titular que se
 * arma letra a letra, cifras que cuentan hasta su valor real al llegar de la
 * API, tarjeta que se inclina siguiendo al puntero, y las microinteracciones del
 * formulario. Todo cae bajo `prefers-reduced-motion`; ver el final de Login.css.
 *
 * Dos correcciones que vienen del original y siguen valiendo:
 *  - checkAuth() pedía /api/me, ruta que el backend no expone (es
 *    /api/verify-token): la reentrada de sesión nunca funcionaba, en silencio.
 *  - el año del pie salía de un document.write, que dentro de la SPA se ejecuta
 *    con el documento ya cargado y borra la página entera.
 */

const HOJAS = ['/assets/css/base.css'];

const CORREO_VALIDO = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
const TOAST_MS = 3600;

/* El titular, por líneas. Se parte en letras al pintar. */
const TITULAR = [
  { txt: 'Economía' },
  { txt: 'Global', em: true },
  { txt: 'en tiempo real' },
];

/* El tablero. Cada fila declara de dónde sale su dato y cómo se escribe; el
   original repetía cuatro veces el mismo bloque de fetch + getElementById.
   `dec` son los decimales: el WTI en dólares por barril no necesita céntimos y
   con dos cifras se lee peor. */
const TABLERO = [
  {
    id: 'tiie', etq: 'TIIE 28 días', fuente: 'BANXICO', icono: 'fa-building-columns',
    ruta: '/api/banxico/SF61745',
    leer: (j) => parseFloat(j?.bmx?.series?.[0]?.datos?.[0]?.dato),
    pre: '', post: '%', dec: 2,
  },
  {
    id: 'maiz', etq: 'Maíz', fuente: 'CME · $/bu', icono: 'fa-seedling',
    ruta: '/api/commodity?fn=CORN',
    // El backend entrega el maíz en $/MT; la vista lo muestra en $/bushel.
    leer: (j) => parseFloat(j?.data?.[0]?.value) / 39.368,
    pre: '$', post: '', dec: 2,
  },
  {
    id: 'wti', etq: 'Petróleo WTI', fuente: 'ENERGÍA · $/bbl', icono: 'fa-oil-well',
    ruta: '/api/commodity?fn=CRUDE_OIL',
    leer: (j) => parseFloat(j?.data?.[0]?.value),
    pre: '$', post: '', dec: 1,
  },
  {
    id: 'trigo', etq: 'Trigo', fuente: 'CME · $/bu', icono: 'fa-wheat-awn',
    ruta: '/api/commodity?fn=WHEAT',
    leer: (j) => parseFloat(j?.data?.[0]?.value) / 36.744,
    pre: '$', post: '', dec: 2,
  },
];

/* Las secciones ya no ocupan media pantalla: son una tira de fichas al pie del
   panel. Siguen diciendo qué hay dentro sin competir con las cifras. */
const SECCIONES = [
  { icono: 'fa-chart-line', texto: 'Finanzas' },
  { icono: 'fa-globe', texto: 'Mercados' },
  { icono: 'fa-earth-americas', texto: 'Geopolítica' },
  { icono: 'fa-peso-sign', texto: 'México' },
  { icono: 'fa-wand-magic-sparkles', texto: 'VALL AI' },
];

/** Una cifra del tablero. Cuenta hasta su valor cuando la API responde. */
function Cifra({ dato, valor, orden }) {
  const animado = useContador(valor);
  const listo = animado != null;
  return (
    <div className={`lg-cifra${listo ? ' lg-cifra-viva' : ''}`} data-revelar="" style={{ '--i': orden }}>
      <span className="lg-cifra-icono"><i className={`fas ${dato.icono}`} aria-hidden="true" /></span>
      <span className="lg-cifra-etq">{dato.etq}</span>
      <strong className="lg-cifra-num">
        {listo
          ? <>{dato.pre}{animado.toFixed(dato.dec)}{dato.post}</>
          /* Guiones y no un cero: un «0.00» al lado de «TIIE» se lee como una
             cotización real que resulta ser cero. */
          : <span className="lg-cifra-espera">--{dato.post}</span>}
      </strong>
      <span className="lg-cifra-fuente">{dato.fuente}</span>
    </div>
  );
}

/** El titular, letra a letra. */
function Titular() {
  let n = 0;
  const completo = TITULAR.map((l) => l.txt).join(' ');
  return (
    /* El texto real va en aria-label y las letras quedan ocultas al lector: si
       no, un lector de pantalla deletrea «E-c-o-n-o-m-í-a». */
    <h1 className="lg-titular" aria-label={completo}>
      {TITULAR.map((linea) => (
        <span className={`lg-linea${linea.em ? ' lg-linea-em' : ''}`} key={linea.txt} aria-hidden="true">
          {[...linea.txt].map((c, i) => (
             
            <span className="lg-letra" key={i} style={{ '--n': n++ }}>
              {c === ' ' ? ' ' : c}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

export default function Login() {
  usePageStyles(HOJAS);
  const navegar = useNavigate();
  const { login } = useAuth();

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const [sacudir, setSacudir] = useState(false);
  const [verClave, setVerClave] = useState(false);
  const [mayus, setMayus] = useState(false);
  const [toast, setToast] = useState(null); // { msg, tipo, n }
  const [datos, setDatos] = useState({});

  const raiz = useRef(null);
  const lienzo = useRef(null);
  const tarjeta = useRef(null);
  const claveRef = useRef(null);

  useRevelado(raiz);
  useTilt(tarjeta);
  useEffect(() => iniciarFondo(lienzo.current, 'rejilla') || undefined, []);

  const correoValido = CORREO_VALIDO.test(correo.trim());
  const hora = useMemo(
    () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    []
  );

  // ── Aviso emergente ─────────────────────────────────────────────────────────
  /* `n` es un contador que cambia en cada aviso. Sin él, dos avisos seguidos con
     el mismo texto no reinician la barra de tiempo: React ve el mismo nodo y la
     animación CSS no vuelve a empezar. */
  const temporizador = useRef(null);
  const cuenta = useRef(0);
  const avisar = useCallback((msg, tipo = 'info') => {
    clearTimeout(temporizador.current);
    cuenta.current += 1;
    setToast({ msg, tipo, n: cuenta.current });
    temporizador.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  // ── Bloq Mayús ──────────────────────────────────────────────────────────────
  /* Solo se puede leer dentro de un evento de teclado: no hay estado global que
     consultar. Se escucha también keyup para que apagarlo se note al soltar. */
  const revisarMayus = useCallback((e) => {
    if (typeof e.getModifierState === 'function') setMayus(e.getModifierState('CapsLock'));
  }, []);

  // ── Sesión ya abierta → entrar directo ──────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    apiGet('/api/verify-token').then(({ ok, data }) => {
      if (vivo && ok && data?.success) {
        login(data.email || '');
        navegar('/inicio', { replace: true });
      }
    });
    return () => { vivo = false; };
  }, [login, navegar]);

  // ── Tablero en vivo ─────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    // En paralelo y cada uno se pinta al llegar: una API caída no debe retrasar
    // ni esconder a las demás.
    for (const { id, ruta, leer } of TABLERO) {
      apiGet(ruta)
        .then(({ ok, data }) => {
          if (!vivo || !ok) return;
          const v = leer(data);
          if (Number.isFinite(v)) setDatos((p) => ({ ...p, [id]: v }));
        })
        .catch(() => {});
    }
    return () => { vivo = false; };
  }, []);

  // ── Envío ───────────────────────────────────────────────────────────────────
  const rechazar = useCallback((msg) => {
    avisar(msg, 'error');
    setSacudir(true);
    setTimeout(() => setSacudir(false), 520);
  }, [avisar]);

  async function enviar(e) {
    e.preventDefault();
    if (enviando || exito) return;
    const email = correo.trim();

    if (!email) return rechazar('Ingresa tu correo empresarial');
    if (!CORREO_VALIDO.test(email)) return rechazar('Formato de correo incorrecto');
    if (!contrasena) return rechazar('La contraseña no puede estar vacía');
    if (contrasena.length < 4) return rechazar('Contraseña demasiado corta');

    setEnviando(true);
    try {
      const { ok, data } = await apiPost('/api/login', { email, password: contrasena });
      if (!ok) {
        rechazar(data?.error || 'Credenciales incorrectas');
        setEnviando(false);
        return;
      }
      // El backend fija la cookie httpOnly `vn_token`; en el cliente solo se
      // guarda la marca de sesión que ProtectedRoute consulta.
      login(data?.email || email);
      setEnviando(false);
      setExito(true);
      avisar('Bienvenido. Cargando plataforma…');
      setTimeout(() => navegar('/inicio', { replace: true }), 900);
    } catch {
      rechazar('Error de conexión con el servidor');
      setEnviando(false);
    }
  }

  return (
    <div className="lg-wrap" ref={raiz}>
      {/* Decoración: si no hay WebGL se queda transparente y manda el degradado
          de .lg-wrap, que ya es un fondo completo. */}
      <canvas className="lg-lienzo" ref={lienzo} aria-hidden="true" />
      <span className="lg-velo" aria-hidden="true" />

      <header className="lg-bar">
        <a href="/" className="lg-marca">
          <span className="lg-marca-icono"><img src="/assets/img/logo1.png" alt="" /></span>
          <span className="lg-marca-txt">VALLNews</span>
        </a>
        <span className="lg-bar-regla" aria-hidden="true" />
        <span className="lg-bar-estado">
          <span className="lg-punto" aria-hidden="true" /> Mercados en vivo
        </span>
      </header>

      <main className="lg-escena">
        <section className="lg-panel">
          <span className="lg-eyebrow" data-revelar="">
            <span className="lg-punto" aria-hidden="true" /> Plataforma de inteligencia
          </span>

          <Titular />

          <p className="lg-lead" data-revelar="">
            Mercados, divisas, commodities y geopolítica en una sola lectura, con
            análisis generado por inteligencia artificial.
          </p>

          <div className="lg-tablero">
            <div className="lg-tablero-cab" data-revelar="">
              <span>Tablero en vivo</span>
              <span className="lg-tablero-hora">{hora}</span>
            </div>
            <div className="lg-tablero-rejilla">
              {TABLERO.map((d, i) => (
                <Cifra key={d.id} dato={d} valor={datos[d.id]} orden={i} />
              ))}
            </div>
          </div>

          <ul className="lg-fichas" data-revelar="">
            {SECCIONES.map((s) => (
              <li key={s.texto}>
                <i className={`fas ${s.icono}`} aria-hidden="true" /> {s.texto}
              </li>
            ))}
          </ul>
        </section>

        <section className="lg-lado">
          <div
            className={`lg-tarjeta${sacudir ? ' lg-sacude' : ''}`}
            ref={tarjeta}
            data-revelar=""
          >
            <span className="lg-tarjeta-halo" aria-hidden="true" />

            <div className="lg-tarjeta-cab">
              <span className="lg-tarjeta-tit">Iniciar sesión</span>
              <span className="lg-tarjeta-sello">PRO</span>
            </div>
            <p className="lg-tarjeta-sub">Accede a tu plataforma de inteligencia económica</p>

            <form onSubmit={enviar} autoComplete="on" noValidate>
              <div className="lg-campo">
                <label htmlFor="email"><i className="fas fa-envelope" aria-hidden="true" /> Correo empresarial</label>
                <div className="lg-caja">
                  <input
                    type="email"
                    id="email"
                    className="lg-input"
                    placeholder="ejecutivo@empresa.com"
                    autoComplete="email"
                    inputMode="email"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    required
                  />
                  {/* Confirma el FORMATO en cuanto es válido. No dice nada de si
                      la cuenta existe: eso solo lo sabe el servidor. */}
                  <span className={`lg-ok${correoValido ? ' on' : ''}`} aria-hidden="true">
                    <i className="fas fa-check" />
                  </span>
                  <span className="lg-raya" aria-hidden="true" />
                </div>
              </div>

              <div className="lg-campo">
                <label htmlFor="password"><i className="fas fa-lock" aria-hidden="true" /> Contraseña</label>
                <div className="lg-caja">
                  <input
                    ref={claveRef}
                    type={verClave ? 'text' : 'password'}
                    id="password"
                    className="lg-input"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    onKeyDown={revisarMayus}
                    onKeyUp={revisarMayus}
                    onBlur={() => setMayus(false)}
                    required
                  />
                  <button
                    type="button"
                    className="lg-ojo"
                    onClick={() => { setVerClave((v) => !v); claveRef.current?.focus(); }}
                    aria-label={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                    aria-pressed={verClave}
                    tabIndex={-1}
                  >
                    <i className={`fas ${verClave ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                  </button>
                  <span className="lg-raya" aria-hidden="true" />
                </div>
                {/* Avisa ANTES de que el intento falle, que es cuando sirve. */}
                <p className={`lg-mayus${mayus ? ' on' : ''}`} role="status">
                  <i className="fas fa-arrow-up" aria-hidden="true" /> Bloq Mayús está activado
                </p>
              </div>

              <button
                type="submit"
                className={`lg-enviar${enviando ? ' cargando' : ''}${exito ? ' hecho' : ''}`}
                disabled={enviando || exito}
              >
                <span>
                  {exito
                    ? <><i className="fas fa-check" aria-hidden="true" /> Listo</>
                    : enviando
                      ? <><i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Verificando…</>
                      : <><i className="fas fa-arrow-right-to-bracket" aria-hidden="true" /> Entrar</>}
                </span>
              </button>
            </form>

            <div className="lg-separa"><span>¿Nuevo en la plataforma?</span></div>

            <button
              type="button"
              className="lg-secundario"
              onClick={() => avisar('Próximamente: suscripción con alertas de mercado y análisis exclusivo.')}
            >
              <i className="fas fa-user-plus" aria-hidden="true" /> Solicitar acceso
            </button>

            <p className="lg-seguro">
              <i className="fas fa-shield-halved" aria-hidden="true" />
              Conexión segura · datos cifrados en tránsito
            </p>
          </div>
        </section>
      </main>

      <footer className="lg-pie">
        © {new Date().getFullYear()} VALLNEWS · Inteligencia Económica Global
      </footer>

      <div
        className={`lg-toast${toast ? ' visible' : ''}${toast?.tipo === 'error' ? ' error' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <i className={`fas ${toast?.tipo === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle'}`} aria-hidden="true" />
        <span>{toast?.msg ?? ''}</span>
        {toast && <span className="lg-toast-barra" key={toast.n} aria-hidden="true" />}
      </div>
    </div>
  );
}
