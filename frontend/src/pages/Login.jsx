import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiPost } from '../api/client.js';
import { loadScriptsInOrder } from '../lib/assets.js';
import './Login.css';

const validEmail = (e) => /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(e);
const year = new Date().getFullYear();

// Tiles iniciales (placeholder mientras cargan los datos en vivo).
const INITIAL_TILES = [
  { key: 'tiie', label: 'TIIE 28D', value: null, unit: '%' },
  { key: 'corn', label: 'Maíz · CME', value: null, unit: '$', suffix: '/bu' },
  { key: 'wti', label: 'Petróleo WTI', value: null, unit: '$', suffix: '/bbl' },
  { key: 'wheat', label: 'Trigo · CME', value: null, unit: '$', suffix: '/bu' },
];

function fmtTile(t) {
  if (t.value == null) return '—';
  if (t.unit === '%') return `${t.value.toFixed(2)}%`;
  return `$${t.value.toFixed(2)}`;
}

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthed } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tiles, setTiles] = useState(INITIAL_TILES);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState({ msg: '', type: 'info', visible: false });
  const toastTimer = useRef(null);

  useEffect(() => {
    if (isAuthed) navigate('/inicio', { replace: true });
  }, [isAuthed, navigate]);

  // Reloj en vivo.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const showToast = (msg, type = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  // Datos de mercado en vivo (capa legacy window.VDS).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadScriptsInOrder(['/js/api-keys.js?v=2', '/js/data-service.js?v=15']);
      const VDS = window.VDS;
      if (!VDS || cancelled) return;
      try {
        const [cornR, oilR, tiieR, wheatR] = await Promise.allSettled([
          VDS.commodityWithPct('CORN'),
          VDS.commodityWithPct('CRUDE_OIL'),
          VDS.banxico('SF61745'),
          VDS.commodityWithPct('WHEAT'),
        ]);
        const pick = (r) => (r.status === 'fulfilled' && r.value != null ? r.value : null);
        const corn = pick(cornR), oil = pick(oilR), tiie = pick(tiieR), wheat = pick(wheatR);
        if (cancelled) return;
        const delta = (c) => (c && typeof c.pct === 'number' ? c.pct : null);
        setTiles([
          { key: 'tiie', label: 'TIIE 28D', value: tiie != null ? parseFloat(tiie) : null, unit: '%' },
          { key: 'corn', label: 'Maíz · CME', value: corn ? corn.price : null, unit: '$', delta: delta(corn) },
          { key: 'wti', label: 'Petróleo WTI', value: oil ? oil.price : null, unit: '$', delta: delta(oil) },
          { key: 'wheat', label: 'Trigo · CME', value: wheat ? wheat.price : null, unit: '$', delta: delta(wheat) },
        ]);
      } catch (e) {
        console.error('Error cargando datos de mercado:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) return showToast('Ingresa tu correo empresarial', 'error');
    if (!validEmail(mail)) return showToast('Formato de correo incorrecto', 'error');
    if (!password) return showToast('La contraseña no puede estar vacía', 'error');
    if (password.length < 4) return showToast('Contraseña demasiado corta', 'error');

    setLoading(true);
    try {
      const { ok, data } = await apiPost('/api/login', { email: mail, password });
      if (!ok) {
        showToast(data.error || 'Credenciales incorrectas', 'error');
        setLoading(false);
        return;
      }
      login(mail);
      navigate('/inicio', { replace: true });
    } catch (err) {
      showToast('Error de conexión con el servidor', 'error');
      setLoading(false);
    }
  };

  const day = now.getDay();
  const hour = now.getHours();
  const marketOpen = day >= 1 && day <= 5 && hour >= 8 && hour < 15;
  const clock = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const tickerItems = tiles.map((t) => (
    <span className="lg-ticker-item" key={t.key}>
      {t.label.toUpperCase()} <b>{fmtTile(t)}</b>
    </span>
  ));

  return (
    <div className="lg-root">
      {/* Topbar */}
      <div className="lg-topbar">
        <div className="lg-brand">
          <img className="lg-mark" src="/Logotipos/logo1.png" alt="VALLNEWS" />
          <span className="lg-brandname">VALL<i>News</i></span>
          <span className="lg-brand-tag">Global Intelligence Terminal</span>
        </div>
        <div className="lg-status">
          <span className={`lg-status-dot${marketOpen ? '' : ' closed'}`}></span>
          <span>{marketOpen ? 'Mercados abiertos' : 'Mercados cerrados'}</span>
          <span className="lg-clock">{clock}</span>
        </div>
      </div>

      <div className="lg-main">
        {/* Panel de inteligencia */}
        <section className="lg-intel">
          <div className="lg-intel-inner">
            <div className="lg-eyebrow"><span className="lg-eyebrow-dot"></span> Plataforma de inteligencia económica</div>
            <h1 className="lg-headline">Los mercados del mundo,<br /><em>en tiempo real.</em></h1>
            <p className="lg-sub">
              Tasas, divisas, commodities y geopolítica con análisis generado por inteligencia
              artificial — en una sola terminal de grado institucional.
            </p>

            <div className="lg-metrics">
              {tiles.map((t) => (
                <div className="lg-metric" key={t.key}>
                  <div className="lg-metric-top">
                    <span className="lg-metric-label">{t.label}</span>
                    {typeof t.delta === 'number' && (
                      <span className={`lg-metric-delta ${t.delta >= 0 ? 'up' : 'down'}`}>
                        {t.delta >= 0 ? '▲' : '▼'} {Math.abs(t.delta).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <span className={`lg-metric-value${t.value == null ? ' pending' : ''}`}>{fmtTile(t)}</span>
                </div>
              ))}
            </div>

            <div className="lg-ticker">
              <div className="lg-ticker-track">
                {tickerItems}
                {tickerItems}
              </div>
            </div>
          </div>
        </section>

        {/* Panel de acceso */}
        <section className="lg-auth">
          <div className="lg-card">
            <div className="lg-card-logo">
              <img src="/Logotipos/logo1.png" alt="VALLNEWS" />
              <b>VALLNews</b>
              <span className="lg-card-badge">PRO</span>
            </div>
            <h2>Acceso institucional</h2>
            <p className="lg-card-sub">Ingresa a tu terminal de inteligencia económica y financiera.</p>

            <form onSubmit={handleSubmit} autoComplete="on">
              <div className="lg-field">
                <label><i className="fas fa-envelope"></i> Correo empresarial</label>
                <input
                  type="email"
                  className="lg-input"
                  placeholder="ejecutivo@empresa.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="lg-field">
                <label><i className="fas fa-lock"></i> Contraseña</label>
                <input
                  type="password"
                  className="lg-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="lg-btn" disabled={loading}>
                {loading ? (
                  <><i className="fas fa-spinner fa-spin"></i> Verificando…</>
                ) : (
                  <><i className="fas fa-arrow-right-to-bracket"></i> Entrar a la terminal</>
                )}
              </button>
            </form>

            <div className="lg-divider">¿Nuevo en la plataforma?</div>
            <div className="lg-subscribe">
              <span>¿No tienes acceso todavía?</span>
              <button
                type="button"
                className="lg-btn-ghost"
                onClick={() => showToast('Próximamente: suscripción con alertas de mercado y análisis exclusivo.')}
              >
                <i className="fas fa-user-plus"></i> Suscribirme
              </button>
            </div>

            <div className="lg-secure">
              <i className="fas fa-shield-halved"></i> Conexión cifrada · datos protegidos en tránsito
            </div>
          </div>
          <span className="lg-copy">© {year} VALLNEWS · Inteligencia Económica Global</span>
        </section>
      </div>

      <div className={`lg-toast${toast.visible ? ' show' : ''}${toast.type === 'error' ? ' error' : ''}`}>
        <i
          className={toast.type === 'error' ? 'fas fa-circle-exclamation' : 'fas fa-circle-check'}
          style={{ color: toast.type === 'error' ? '#ff6b57' : '#2fbf71' }}
        ></i>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
