import { useCallback, useEffect, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import { apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import './Configuracion.css';

/*
 * Configuración de cuenta en React idiomático (antes pages/configuracion.html).
 *
 * El original guardaba el estado en el DOM y lo leía con getElementById en cada
 * manejador; aquí los tres formularios son inputs controlados.
 *
 * El <style> embebido pasó a Configuracion.css, con las clases prefijadas
 * `cfg-` porque las originales (.panel, .btn, .container, .form-group) son
 * nombres genéricos que chocaban con base.css y con el resto de secciones.
 */

const HOJAS = [
  '/assets/css/base.css',
  '/assets/css/header.css',
  '/assets/css/footer.css',
  '/assets/css/responsive.css',
];

// Claves que dejó el antiguo selector de mascotas. El widget ya no las lee,
// pero se limpian para que no reaparezcan personajes viejos si alguien
// reintrodujera esa lectura.
const CLAVES_MASCOTA = [
  'vn_mascot_choice', 'vn_mascot_widget_src', 'vn_mascot_hover_src',
  'vn_mascot_obj_pos', 'vn_mascot_translate', 'vn_mascot_translate_m',
];

export default function Configuracion() {
  usePageStyles(HOJAS);
  const { user } = useAuth();

  const correo = user || sessionStorage.getItem('vn_user') || localStorage.getItem('vn_user') || '';

  const [nombre, setNombre] = useState(() => localStorage.getItem('vn_display_name') || '');
  const [nombreMostrado, setNombreMostrado] = useState(nombre);
  const [claves, setClaves] = useState({ actual: '', nueva: '', confirmar: '' });
  const [cambiando, setCambiando] = useState(false);
  const [toast, setToast] = useState(null); // { msg, tipo }

  const temporizador = useRef(null);
  const avisar = useCallback((msg, tipo) => {
    clearTimeout(temporizador.current);
    setToast({ msg, tipo });
    temporizador.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  useEffect(() => {
    try { CLAVES_MASCOTA.forEach((k) => localStorage.removeItem(k)); } catch { /* modo privado */ }
  }, []);

  function guardarPerfil() {
    const limpio = nombre.trim();
    localStorage.setItem('vn_display_name', limpio);
    setNombreMostrado(limpio);
    avisar('Perfil guardado', 'ok');
  }

  async function cambiarClave() {
    const { actual, nueva, confirmar } = claves;
    if (!actual || !nueva || !confirmar) return avisar('Completa todos los campos', 'err');
    if (nueva.length < 6) return avisar('La contraseña debe tener al menos 6 caracteres', 'err');
    if (nueva !== confirmar) return avisar('Las contraseñas no coinciden', 'err');

    setCambiando(true);
    try {
      const { data } = await apiPost('/api/change-password', {
        currentPassword: actual,
        newPassword: nueva,
      });
      if (data?.success) {
        avisar('Contraseña actualizada correctamente', 'ok');
        setClaves({ actual: '', nueva: '', confirmar: '' });
      } else {
        avisar(data?.error || 'Error al cambiar la contraseña', 'err');
      }
    } catch {
      avisar('Error de conexión', 'err');
    } finally {
      setCambiando(false);
    }
  }

  const campoClave = (id, etiqueta, campo, marcador, autocompletar) => (
    <div className="cfg-form-group">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        type="password"
        placeholder={marcador}
        autoComplete={autocompletar}
        value={claves[campo]}
        onChange={(e) => setClaves((p) => ({ ...p, [campo]: e.target.value }))}
      />
    </div>
  );

  return (
    <>
      <Header />
      <main style={{ paddingTop: '1rem' }}>
        <div className="cfg-container">
          <h1 className="cfg-page-title">
            <i className="fas fa-sliders" /> Configuración de cuenta
          </h1>

          <div className="cfg-panel">
            <div className="cfg-section-lbl"><i className="fas fa-user" /> Perfil</div>
            <div className="cfg-profile-header">
              <div className="cfg-profile-avatar">
                <img src="/assets/img/robot.svg" alt="Asistente VALL-AI" />
              </div>
              <div className="cfg-profile-info">
                <h2>{nombreMostrado || 'Usuario'}</h2>
                <p>{correo || 'Usuario'}</p>
              </div>
            </div>
            <div className="cfg-form-group">
              <label htmlFor="input-name">Nombre para mostrar</label>
              <input
                id="input-name"
                type="text"
                maxLength={40}
                placeholder="Tu nombre o apodo"
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <div className="cfg-form-hint">Solo se guarda en este dispositivo.</div>
            </div>
            <div className="cfg-form-group">
              <label htmlFor="input-email">Correo electrónico</label>
              <input id="input-email" type="email" value={correo} disabled readOnly />
            </div>
            <button className="cfg-btn cfg-btn-primary" onClick={guardarPerfil}>
              <i className="fas fa-floppy-disk" /> Guardar perfil
            </button>
          </div>

          <div className="cfg-panel">
            <div className="cfg-section-lbl"><i className="fas fa-robot" /> Asistente VALL-AI</div>
            <div className="cfg-assistant-identity">
              <div className="cfg-assistant-avatar">
                <img src="/assets/img/robot.svg" alt="Asistente VALL-AI" />
              </div>
              <div>
                <strong>VALL-AI</strong>
                <p>
                  Un único asistente para toda la plataforma. Aparece en la burbuja de chat
                  de cada sección y en la página de análisis.
                </p>
              </div>
            </div>
          </div>

          <div className="cfg-panel">
            <div className="cfg-section-lbl"><i className="fas fa-lock" /> Seguridad</div>
            {campoClave('input-curr-pass', 'Contraseña actual', 'actual', '••••••••', 'current-password')}
            {campoClave('input-new-pass', 'Nueva contraseña', 'nueva', 'Mínimo 6 caracteres', 'new-password')}
            {campoClave('input-confirm-pass', 'Confirmar nueva contraseña', 'confirmar', 'Repite la nueva contraseña', 'new-password')}
            <button className="cfg-btn cfg-btn-primary" onClick={cambiarClave} disabled={cambiando}>
              {cambiando
                ? <><i className="fas fa-spinner fa-spin" /> Cambiando…</>
                : <><i className="fas fa-key" /> Cambiar contraseña</>}
            </button>
          </div>
        </div>
      </main>
      <Footer />

      <div
        id="vn-toast"
        className={`cfg-toast${toast ? ` show toast-${toast.tipo}` : ''}`}
        role="status"
        aria-live="polite"
      >
        {toast?.msg ?? ''}
      </div>
    </>
  );
}
