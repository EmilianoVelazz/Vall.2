import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import usePageStyles from '../lib/usePageStyles.js';
import { apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import LoginExperience from '../components/LoginExperience.jsx';
import './Login.css';

const HOJAS = ['/assets/css/base.css'];
const CORREO_VALIDO = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
const TOAST_MS = 4200;

function Icon({ name, className = '' }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hidden: <><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a22 22 0 0 1-3 4M6 6a23 23 0 0 0-4 6s3.5 7 10 7a12 12 0 0 0 5-1.2" /><path d="M9.8 9.8a3 3 0 0 0 4.4 4.4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    spinner: <path d="M20 12a8 8 0 1 1-8-8" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  };
  return <svg className={`lx-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

export default function Login() {
  usePageStyles(HOJAS);
  const navegar = useNavigate();
  const { login, isAuthed, sessionChecked } = useAuth();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const [sacudir, setSacudir] = useState(false);
  const [verClave, setVerClave] = useState(false);
  const [mayus, setMayus] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const [campoError, setCampoError] = useState(null);
  const correoRef = useRef(null);
  const temporizador = useRef(null);
  const sacudida = useRef(null);
  const redireccion = useRef(null);
  const cuenta = useRef(0);
  const claveRef = useRef(null);

  const avisar = useCallback((msg, tipo = 'info') => {
    clearTimeout(temporizador.current);
    cuenta.current += 1;
    setToast({ msg, tipo, n: cuenta.current });
    temporizador.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => {
    clearTimeout(temporizador.current);
    clearTimeout(sacudida.current);
    clearTimeout(redireccion.current);
  }, []);
  const revisarMayus = useCallback(e => {
    if (typeof e.getModifierState === 'function') setMayus(e.getModifierState('CapsLock'));
  }, []);
  useEffect(() => {
    if (sessionChecked && isAuthed && !enviando && !exito) navegar('/inicio', { replace: true });
  }, [sessionChecked, isAuthed, enviando, exito, navegar]);
  const rechazar = useCallback((msg, campo = null) => {
    setError(msg);
    setToast(null);
    setCampoError(campo);
    setSacudir(true);
    clearTimeout(sacudida.current);
    sacudida.current = setTimeout(() => setSacudir(false), 520);
    if (campo === 'email') correoRef.current?.focus();
    if (campo === 'password') claveRef.current?.focus();
  }, []);
  async function enviar(e) {
    e.preventDefault();
    if (enviando || exito) return;
    const email = correo.trim();
    if (!email) return rechazar('Ingresa tu correo empresarial', 'email');
    if (!CORREO_VALIDO.test(email)) return rechazar('Formato de correo incorrecto', 'email');
    if (!contrasena) return rechazar('La contraseña no puede estar vacía', 'password');
    if (contrasena.length < 4) return rechazar('Contraseña demasiado corta', 'password');
    setEnviando(true);
    setCampoError(null);
    setError('');
    try {
      const { ok, data } = await apiPost('/api/login', { email, password: contrasena });
      if (!ok || data?.success !== true) {
        rechazar(data?.error || 'Credenciales incorrectas');
        setEnviando(false);
        return;
      }
      // El backend conserva la cookie httpOnly de la sesión.
      login(data?.email || email);
      setEnviando(false);
      setExito(true);
      avisar('Bienvenido. Cargando plataforma…');
      redireccion.current = setTimeout(() => navegar('/inicio', { replace: true }), 900);
    } catch {
      rechazar('Error de conexión con el servidor');
      setEnviando(false);
    }
  }
  return (
    <div className="lg-wrap lx-login">
      <header className="lx-header">
        <Link to="/" className="lx-brand" aria-label="VALLNews, inicio"><img src="/assets/img/brand/logo.png" alt="" width="32" height="32" /><span>VALL<span>News</span><small>EL VALOR DE LA PERSPECTIVA</small></span></Link>
        <Link to="/" className="lx-return"><Icon name="back" /><span>Volver a la presentación</span></Link>
      </header>
      <main className="lx-layout">
        <LoginExperience />
        <section className="lx-access" aria-labelledby="lx-title">
          <div className="lx-form-entry">
          <div className={`lx-form-panel${sacudir ? ' lx-shake' : ''}`}>
            <span className="lx-access-mark"><Icon name="lock" /></span>
            <p className="lx-access-eyebrow">TU ESPACIO EN VALLNEWS</p>
            <h1 id="lx-title">Bienvenido<br /><span>de nuevo.</span></h1>
            <p className="lx-access-intro">Entra y encuentra una nueva perspectiva.</p>
            <form onSubmit={enviar} autoComplete="on" noValidate aria-busy={enviando} aria-label="Iniciar sesión">
              <div className="lx-field">
                <label htmlFor="email">Correo empresarial</label>
                <div className="lx-input-wrap">
                  <Icon name="mail" />
                  <input ref={correoRef} type="email" id="email" name="email" placeholder="tu@empresa.com" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={correo} onChange={e => { setCorreo(e.target.value); if (campoError === 'email' || !campoError) { setCampoError(null); setError(''); } }} aria-invalid={campoError === 'email'} aria-describedby={campoError === 'email' ? 'lx-error' : undefined} required />
                </div>
              </div>
              <div className="lx-field">
                <label htmlFor="password">Contraseña</label>
                <div className="lx-input-wrap">
                  <Icon name="lock" />
                  <input ref={claveRef} type={verClave ? 'text' : 'password'} id="password" name="password" placeholder="Tu contraseña" autoComplete="current-password" value={contrasena} onChange={e => { setContrasena(e.target.value); if (campoError === 'password' || !campoError) { setCampoError(null); setError(''); } }} onKeyDown={revisarMayus} onKeyUp={revisarMayus} onBlur={() => setMayus(false)} aria-invalid={campoError === 'password'} aria-describedby={campoError === 'password' ? 'lx-error' : mayus ? 'lx-caps' : undefined} required />
                  <button type="button" className="lx-password-toggle" onClick={() => setVerClave(v => !v)} aria-label={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'} aria-pressed={verClave}><Icon name={verClave ? 'hidden' : 'eye'} /></button>
                </div>
                {mayus && <p className="lx-caps" id="lx-caps" role="status">↑ Bloq Mayús está activado</p>}
              </div>
              <div className="lx-feedback" aria-live="polite">{error && <p className="lx-error" id="lx-error" role="alert"><Icon name="info" />{error}</p>}</div>
              <button type="submit" className={`lx-submit${exito ? ' lx-success' : ''}`} disabled={enviando || exito}><span>{exito ? 'Bienvenido' : enviando ? 'Verificando…' : 'Entrar a la plataforma'}</span><Icon name={exito ? 'check' : enviando ? 'spinner' : 'arrow'} className={enviando ? 'lx-spin' : ''} /></button>
            </form>
            <p className="lx-security"><Icon name="shield" /> Acceso privado. Tu información, protegida.</p>
            <div className="lx-invitation"><p>¿Aún no tienes una cuenta?</p><button type="button" onClick={() => avisar('Para solicitar una cuenta, contacta al administrador de tu organización.')}>Solicitar acceso <span aria-hidden="true">↗</span></button></div>
          </div>
          </div>
          <div className="lx-access-bottom"><span className="lx-mini-brand">VN</span><span>EL CONTEXTO HACE LA DIFERENCIA.</span></div>
        </section>
      </main>
      <footer className="lx-footer"><span>© {new Date().getFullYear()} VALLNews</span><span>INFORMACIÓN QUE SE CONVIERTE EN PERSPECTIVA.</span></footer>
      <div className={`lx-toast${toast ? ' lx-toast-visible' : ''}`} role="status" aria-live="polite" aria-atomic="true"><Icon name={exito ? 'check' : 'info'} /><span>{toast?.msg}</span>{toast && <span className="lx-toast-progress" key={toast.n} aria-hidden="true" />}</div>
    </div>
  );
}
