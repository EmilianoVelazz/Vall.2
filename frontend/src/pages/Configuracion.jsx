import { useState, useRef } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiPost } from '../api/client.js';
import { usePageStyles } from '../lib/assets.js';
import './Configuracion.css';

export default function Configuracion() {
  usePageStyles(['/css/header.css?v=6', '/css/footer.css']);
  const { user } = useAuth();
  const email = user || '';

  const [displayName, setDisplayName] = useState(() => localStorage.getItem('vn_display_name') || '');
  const [inputName, setInputName] = useState(() => localStorage.getItem('vn_display_name') || '');
  const [curr, setCurr] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [toast, setToast] = useState({ msg: '', type: '', show: false });
  const toastTimer = useRef(null);

  const showToast = (msg, type = '') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type, show: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  };

  const saveProfile = () => {
    const name = inputName.trim();
    localStorage.setItem('vn_display_name', name);
    setDisplayName(name);
    showToast('Perfil guardado', 'ok');
  };

  const changePassword = async () => {
    if (!curr || !next || !confirm) return showToast('Completa todos los campos', 'err');
    if (next.length < 8 || next.length > 128) return showToast('La contraseña debe tener entre 8 y 128 caracteres', 'err');
    if (next !== confirm) return showToast('Las contraseñas no coinciden', 'err');
    setSavingPass(true);
    try {
      const { data } = await apiPost('/api/change-password', { currentPassword: curr, newPassword: next });
      if (data.success) {
        showToast('Contraseña actualizada correctamente', 'ok');
        setCurr(''); setNext(''); setConfirm('');
      } else {
        showToast(data.error || 'Error al cambiar la contraseña', 'err');
      }
    } catch {
      showToast('Error de conexión', 'err');
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <>
      <Header />
      <main className="cfg-main">
        <div className="cfg-container">
          <h1 className="cfg-title"><i className="fas fa-sliders"></i> Configuración de cuenta</h1>

          {/* Perfil */}
          <section className="cfg-panel">
            <div className="cfg-section-lbl"><i className="fas fa-user"></i> Perfil</div>
            <div className="cfg-profile">
              <div className="cfg-avatar"><img src="/Logotipos/mascota-atlas.svg" alt="Mascota" /></div>
              <div className="cfg-profile-info">
                <h2>{displayName || 'Usuario'}</h2>
                <p>{email || 'Usuario'}</p>
              </div>
            </div>
            <div className="cfg-field">
              <label>Nombre para mostrar</label>
              <input
                type="text" maxLength={40} placeholder="Tu nombre o apodo" autoComplete="off"
                value={inputName} onChange={(e) => setInputName(e.target.value)}
              />
              <div className="cfg-hint">Solo se guarda en este dispositivo.</div>
            </div>
            <div className="cfg-field">
              <label>Correo electrónico</label>
              <input type="email" value={email} disabled />
            </div>
            <button className="cfg-btn" onClick={saveProfile}>
              <i className="fas fa-floppy-disk"></i> Guardar perfil
            </button>
          </section>

          {/* Seguridad */}
          <section className="cfg-panel">
            <div className="cfg-section-lbl"><i className="fas fa-lock"></i> Seguridad</div>
            <div className="cfg-field">
              <label>Contraseña actual</label>
              <input
                type="password" placeholder="••••••••" autoComplete="current-password"
                value={curr} onChange={(e) => setCurr(e.target.value)}
              />
            </div>
            <div className="cfg-field">
              <label>Nueva contraseña</label>
              <input
                type="password" placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                value={next} onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div className="cfg-field">
              <label>Confirmar nueva contraseña</label>
              <input
                type="password" placeholder="Repite la nueva contraseña" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button className="cfg-btn" onClick={changePassword} disabled={savingPass}>
              {savingPass ? (
                <><i className="fas fa-spinner fa-spin"></i> Cambiando…</>
              ) : (
                <><i className="fas fa-key"></i> Cambiar contraseña</>
              )}
            </button>
          </section>
        </div>
      </main>
      <Footer />

      <div className={`cfg-toast${toast.show ? ' show' : ''}${toast.type === 'ok' ? ' ok' : toast.type === 'err' ? ' err' : ''}`}>
        {toast.msg}
      </div>
    </>
  );
}
