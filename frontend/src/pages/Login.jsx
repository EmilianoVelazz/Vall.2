import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePageStyles from '../lib/usePageStyles.js';
import { apiGet, apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/*
 * Login en React idiomático (antes index.html + assets/js/login.js).
 *
 * Conserva el markup y las clases de assets/css/login.css, así que el aspecto es
 * el mismo; lo que cambia es que el estado vive en hooks y no en el DOM.
 *
 * Dos correcciones respecto del original:
 *  - checkAuth() pedía /api/me, ruta que el backend no expone (es
 *    /api/verify-token), así que la reentrada automática de sesión nunca
 *    funcionaba y siempre fallaba en silencio.
 *  - el año del pie salía de un document.write, que dentro de la SPA se ejecuta
 *    con el documento ya cargado y borra la página entera.
 */

const HOJAS = ['/assets/css/base.css', '/assets/css/login.css'];

const CORREO_VALIDO = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;

// Cada insignia declara de dónde sale su dato y cómo se muestra. El original
// repetía cuatro veces el mismo bloque de fetch + getElementById.
const INSIGNIAS = [
  {
    id: 'fin',
    ruta: '/api/banxico/SF61745',
    leer: (j) => parseFloat(j?.bmx?.series?.[0]?.datos?.[0]?.dato),
    formato: (v) => `TIIE ${v.toFixed(2)}%`,
  },
  {
    id: 'mkt',
    ruta: '/api/commodity?fn=CORN',
    // El backend entrega el maíz en $/MT; la vista lo muestra en $/bushel.
    leer: (j) => parseFloat(j?.data?.[0]?.value) / 39.368,
    formato: (v) => `Maíz $${v.toFixed(2)}/bu`,
  },
  {
    id: 'geo',
    ruta: '/api/commodity?fn=CRUDE_OIL',
    leer: (j) => parseFloat(j?.data?.[0]?.value),
    formato: (v) => `WTI $${v.toFixed(1)}/bbl`,
  },
  {
    id: 'mx',
    ruta: '/api/commodity?fn=WHEAT',
    leer: (j) => parseFloat(j?.data?.[0]?.value) / 36.744,
    formato: (v) => `Trigo $${v.toFixed(2)}/bu`,
  },
];

const SECCIONES = [
  { icono: 'fa-chart-line', titulo: 'Finanzas', desc: 'Tasas, inflación y política monetaria', insignia: 'fin' },
  { icono: 'fa-globe', titulo: 'Mercados', desc: 'Commodities y materias primas', insignia: 'mkt' },
  { icono: 'fa-earth-americas', titulo: 'Geopolítica', desc: 'Conflictos y cadenas de suministro', insignia: 'geo' },
  { icono: 'fa-peso-sign', titulo: 'México', desc: 'Peso, Banxico e indicadores INEGI', insignia: 'mx' },
];

export default function Login() {
  usePageStyles(HOJAS);
  const navegar = useNavigate();
  const { login } = useAuth();

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState(null); // { msg, tipo }
  const [insignias, setInsignias] = useState({});

  // ── Toast ───────────────────────────────────────────────────────────────────
  const temporizador = useRef(null);
  const avisar = useCallback((msg, tipo = 'info') => {
    clearTimeout(temporizador.current);
    setToast({ msg, tipo });
    temporizador.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  // ── Sesión ya abierta → entrar directo ──────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    apiGet('/api/verify-token').then(({ ok, data }) => {
      if (vivo && ok && data?.success) {
        login(data.email || 'sesion', data.email || '');
        navegar('/inicio', { replace: true });
      }
    });
    return () => { vivo = false; };
  }, [login, navegar]);

  // ── Insignias de mercado ────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    // Se piden en paralelo y cada una se pinta en cuanto llega: una API caída no
    // debe retrasar ni ocultar a las demás.
    for (const { id, ruta, leer, formato } of INSIGNIAS) {
      apiGet(ruta)
        .then(({ ok, data }) => {
          if (!vivo || !ok) return;
          const valor = leer(data);
          if (Number.isFinite(valor)) setInsignias((p) => ({ ...p, [id]: formato(valor) }));
        })
        .catch(() => {});
    }
    return () => { vivo = false; };
  }, []);

  // ── Envío ───────────────────────────────────────────────────────────────────
  async function enviar(e) {
    e.preventDefault();
    const email = correo.trim();

    if (!email) return avisar('Ingresa tu correo empresarial', 'error');
    if (!CORREO_VALIDO.test(email)) return avisar('Formato de correo incorrecto', 'error');
    if (!contrasena) return avisar('La contraseña no puede estar vacía', 'error');
    if (contrasena.length < 4) return avisar('Contraseña demasiado corta', 'error');

    setEnviando(true);
    try {
      const { ok, data } = await apiPost('/api/login', { email, password: contrasena });
      if (!ok) {
        avisar(data?.error || 'Credenciales incorrectas', 'error');
        setEnviando(false);
        return;
      }
      // El backend fija la cookie httpOnly `vn_token`; en el cliente solo se
      // guarda la marca de sesión que ProtectedRoute consulta.
      login(data?.token || 'sesion', email);
      avisar('Bienvenido. Cargando plataforma…');
      setTimeout(() => navegar('/inicio', { replace: true }), 500);
    } catch {
      avisar('Error de conexión con el servidor', 'error');
      setEnviando(false);
    }
  }

  return (
    <div className="pageWrap">
      <div className="topBar">
        <a href="/" className="topBarLogo">
          <div className="topBarIcon"><img src="/assets/img/logo1.png" alt="VALLNEWS" /></div>
          <span className="topBarName">VALLNews</span>
        </a>
        <span className="topBarTagline">
          Datos en tiempo real &nbsp;&middot;&nbsp; Economía global &nbsp;&middot;&nbsp; Mercados
        </span>
      </div>
      <div className="topDivider" />

      <div className="loginLayout">
        <div className="brandPanel">
          <div className="brandEyebrow">
            <span className="brandEyebrowDot" />
            Plataforma de inteligencia
          </div>
          <h1 className="brandHeadline">
            Economía<br /><em>Global</em><br />en tiempo real
          </h1>
          <p className="brandDesc">
            Seguimiento de mercados, divisas, commodities y geopolítica con análisis
            generado por inteligencia artificial.
          </p>

          <div className="brandFeatures">
            {SECCIONES.map(({ icono, titulo, desc, insignia }) => (
              <div className="featureRow" key={insignia}>
                <div className="featureIcon"><i className={`fas ${icono}`} /></div>
                <span><strong>{titulo}</strong> — {desc}</span>
                {/* Sin dato no se pinta la píldora: el original dejaba un
                    recuadro gris vacío cuando la API no respondía. */}
                {insignias[insignia] && (
                  <span className="featBadge">{insignias[insignia]}</span>
                )}
              </div>
            ))}
            <div className="featureRow">
              <div className="featureIcon featureIconGold">
                <i className="fas fa-microchip" style={{ color: '#d97706' }} />
              </div>
              <span><strong>VALL AI</strong> — Predicciones con IA generativa</span>
              <span className="featBadge featBadgeGold">ACTIVO</span>
            </div>
          </div>

          <span className="brandFooter">
            © {new Date().getFullYear()} VALLNEWS · Inteligencia Económica Global
          </span>
        </div>

        <div className="formPanel">
          <div className="loginCard">
            <div className="cardLogo">
              <div className="cardLogoIcon"><img src="/assets/img/logo2.png" alt="VALLNEWS" /></div>
              <span className="cardLogoText">VALLNews</span>
              <span className="cardLogoBadge">PRO</span>
            </div>
            <h2 className="cardTitle">Iniciar sesión</h2>
            <p className="cardSubtitle">Accede a tu plataforma de inteligencia económica</p>

            <form onSubmit={enviar} autoComplete="on">
              <div className="inputGroup">
                <label htmlFor="email"><i className="fas fa-envelope" /> Correo empresarial</label>
                <input
                  type="email"
                  id="email"
                  className="inputField"
                  placeholder="ejecutivo@empresa.com"
                  autoComplete="email"
                  inputMode="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  required
                />
              </div>
              <div className="inputGroup">
                <label htmlFor="password"><i className="fas fa-lock" /> Contraseña</label>
                <input
                  type="password"
                  id="password"
                  className="inputField"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btnPrimary" disabled={enviando}>
                <span>
                  {enviando
                    ? <><i className="fas fa-spinner fa-spin" /> Ingresando…</>
                    : <><i className="fas fa-arrow-right-to-bracket" /> Iniciar sesión</>}
                </span>
              </button>
            </form>

            <div className="divider"><span className="dividerText">¿Nuevo en la plataforma?</span></div>
            <div className="subscribeRow">
              <span className="subscribeText">
                <i className="fas fa-chart-line" style={{ fontSize: '0.75rem', color: '#d97706', marginRight: '0.3rem' }} />
                ¿No tienes acceso?
              </span>
              <button
                type="button"
                className="btnSecondary"
                onClick={() => avisar('Próximamente: suscripción con alertas de mercado y análisis exclusivo.')}
              >
                <i className="fas fa-user-plus" /> Suscribirme
              </button>
            </div>
            <div className="securityNote">
              <i className="fas fa-shield-halved" />
              Conexión segura · datos cifrados en tránsito
            </div>
          </div>
        </div>
      </div>

      <div
        id="toast"
        className={`toast${toast ? ' visible' : ''}${toast?.tipo === 'error' ? ' error' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <i
          className={`fas ${toast?.tipo === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle'}`}
          style={{ color: toast?.tipo === 'error' ? '#f87171' : '#60a5fa' }}
        />
        <span>{toast?.msg ?? ''}</span>
      </div>
    </div>
  );
}
