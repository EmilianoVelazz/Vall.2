import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import ConstelacionOrion from '../components/ConstelacionOrion.jsx';
import Footer from '../components/Footer.jsx';
import AdminProfiles from '../components/AdminProfiles.jsx';
import usePageStyles from '../lib/usePageStyles.js';
import { apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import useIdioma, { IDIOMAS } from '../lib/idioma.js';
import { ESQUELETO } from '../lib/hojasComunes.js';
import './Configuracion.css';

const SECTIONS = [
  { id: 'inicio', label: 'Mi cuenta', icon: 'fa-house', hint: 'Todo lo importante, en un solo lugar.', terms: 'resumen principal cuenta' },
  { id: 'personal', label: 'Información personal', icon: 'fa-user', hint: 'Tu identidad y los datos que eliges compartir con VALLNews.', terms: 'perfil nombre correo teléfono empresa país' },
  { id: 'negocio', label: 'Mi negocio y ORION', icon: 'fa-store', hint: 'Define las proteínas y mercados habituales de tu empresa.', terms: 'negocio proteínas res cerdo pollo huevo moneda mercados orion' },
  { id: 'seguridad', label: 'Seguridad y contraseña', icon: 'fa-shield-halved', hint: 'Administra la contraseña con la que accedes a tu cuenta.', terms: 'acceso clave cambiar contraseña' },
  { id: 'planes', label: 'Planes', icon: 'fa-layer-group', hint: 'Conoce Estándar y Plus, los planes de VALLNews.', terms: 'suscripción estandar plus beneficios' },
  { id: 'pagos', label: 'Pagos y facturación', icon: 'fa-credit-card', hint: 'Un espacio para tus métodos de pago y comprobantes.', terms: 'tarjetas cobros recibos factura pago' },
  { id: 'privacidad', label: 'Datos y privacidad', icon: 'fa-fingerprint', hint: 'Conoce qué información guarda tu perfil y descarga una copia.', terms: 'exportar descargar datos privacidad información' },
  { id: 'preferencias', label: 'Preferencias', icon: 'fa-sliders', hint: 'El idioma y las herramientas que acompañan tu lectura.', terms: 'idioma español ingles orion asistente' },
];
const EMPTY_PERSONAL = { phone: '', organization: '', position: '', country: '' };
const PROFILE_SECTION = {id:'perfiles',label:'Perfiles de acceso',icon:'fa-users',hint:'Gestiona las cuentas y su acceso a la plataforma.',terms:'usuarios perfiles acceso cuentas restablecer contraseña'};
const BUSINESS_PRODUCTS = [['beef','Res'],['pork','Cerdo'],['eggs','Huevo'],['poultry','Pollo']];
const clean = value => typeof value === 'string' ? value : '';
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function Icon({ name }) { if (name === 'orion') return <ConstelacionOrion className="ac-constellation ac-constellation--icon" label="Constelación de ORION" />; return <i className={`fa-solid ${name}`} aria-hidden="true" />; }
function Panel({ title, intro, icon, children, className = '' }) {
  return <section className={`ac-panel ${className}`}><div className="ac-panel-heading"><span className="ac-icon"><Icon name={icon} /></span><div><h3>{title}</h3>{intro && <p>{intro}</p>}</div></div>{children}</section>;
}
function AccountAvatar({ name, large = false }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'V';
  return <span className={`ac-avatar${large ? ' ac-avatar--large' : ''}`} aria-hidden="true">{initials}</span>;
}
async function profileRequest(body, signal) {
  const response = await fetch('/api/profile', { credentials: 'include', cache: 'no-store', signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success || !payload.profile) throw new Error(payload.error || 'No se pudo conectar con tu perfil.');
  return payload.profile;
}

export default function Configuracion() {
  usePageStyles(ESQUELETO);
  const { user } = useAuth();
  const [idioma, cambiarIdioma] = useIdioma();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [personal, setPersonal] = useState(EMPTY_PERSONAL);
  const [business, setBusiness] = useState({products:[],markets:'',currency:'',role:'merchant'});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [passwords, setPasswords] = useState({ actual: '', nueva: '', confirmar: '' });
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState(null);
  const heading = useRef(null);
  const focusSection = useRef(false);
  const email = profile?.email || user || '';
  const displayName = profile?.displayName || (email ? email.split('@')[0] : 'Tu cuenta');
  const role = profile?.role === 'admin' ? 'Administrador' : profile ? 'Usuario' : 'Cuenta VALLNews';
  const sections = profile?.role==='admin' ? [...SECTIONS,PROFILE_SECTION] : SECTIONS;
  const active = sections.find(item => item.id === params.get('seccion')) || SECTIONS[0];
  const matches = search.trim() ? sections.filter(item => normalize(`${item.label} ${item.terms}`).includes(normalize(search.trim()))) : [];

  useEffect(() => {
    const title = document.title;
    document.title = 'Mi cuenta | VALLNews'; document.body.classList.add('vn-account');
    return () => { document.title = title; document.body.classList.remove('vn-account'); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 18_000);
    let mounted = true; setLoading(true); setLoadError('');
    profileRequest(null, controller.signal).then(value => {
      if (!mounted) return;
      setProfile(value); setName(value.displayName || '');
      setPersonal(Object.fromEntries(Object.keys(EMPTY_PERSONAL).map(key => [key, clean(value.preferences?.personal?.[key])])));
      const saved = value.preferences?.businessProfile || {};
      setBusiness({ products:Array.isArray(saved.products) ? saved.products : [], markets:Array.isArray(saved.markets) ? saved.markets.join(', ') : '', currency:saved.currency || '', role:saved.role || 'merchant' });
    }).catch(error => { if (mounted) setLoadError(error.name === 'AbortError' ? 'Tu perfil está tardando en responder. Vuelve a intentarlo.' : error.message); })
      .finally(() => { clearTimeout(timer); if (mounted) setLoading(false); });
    return () => { mounted = false; clearTimeout(timer); controller.abort(); };
  }, [reload]);
  useEffect(() => {
    if (focusSection.current) { heading.current?.focus({ preventScroll: true }); focusSection.current = false; }
    setNotice(null); setPasswords({ actual: '', nueva: '', confirmar: '' }); setVisiblePasswords({});
  }, [active.id]);

  function go(id) { focusSection.current = true; setSearch(''); setParams(id === 'inicio' ? {} : { seccion: id }); }
  async function saveProfile(event) {
    event.preventDefault(); if (!profile || saving) return;
    if (!name.trim()) return setNotice({ type: 'error', message: 'Escribe un nombre para mostrar.' });
    setSaving(true); setNotice(null);
    try {
      const value = await profileRequest({ displayName: name.trim(), preferences: { personal: Object.fromEntries(Object.entries(personal).map(([key, value]) => [key, value.trim()])) } });
      setProfile(value); setName(value.displayName || '');
      try { localStorage.setItem('vn_display_name', value.displayName || ''); } catch { /* storage unavailable */ }
      setNotice({ type: 'ok', message: 'Tus datos se guardaron en tu cuenta.' });
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setSaving(false); }
  }
  async function saveBusiness(event) {
    event.preventDefault(); if (!profile || saving) return;
    setSaving(true); setNotice(null);
    try {
      const saved = { ...business, markets:business.markets.split(',').map(value=>value.trim()).filter(Boolean).slice(0,10) };
      setProfile(await profileRequest({ preferences:{ businessProfile:saved } }));
      setNotice({type:'ok',message:'ORION usará estas preferencias en tus próximas consultas.'});
    } catch (error) { setNotice({type:'error',message:error.message}); }
    finally { setSaving(false); }
  }
  async function changePassword(event) {
    event.preventDefault(); setNotice(null);
    if (passwords.nueva !== passwords.confirmar) return setNotice({ type: 'error', message: 'Las contraseñas nuevas no coinciden.' });
    if (passwords.actual === passwords.nueva) return setNotice({ type: 'error', message: 'Elige una contraseña diferente a la actual.' });
    setChanging(true);
    try {
      const { ok, data } = await apiPost('/api/change-password', { currentPassword: passwords.actual, newPassword: passwords.nueva });
      if (!ok || !data?.success) throw new Error(data?.error || 'No se pudo cambiar la contraseña.');
      setPasswords({ actual: '', nueva: '', confirmar: '' }); setVisiblePasswords({});
      setNotice({ type: 'ok', message: 'Contraseña actualizada correctamente.' });
    } catch (error) { setNotice({ type: 'error', message: error.message || 'No se pudo conectar. Vuelve a intentarlo.' }); }
    finally { setChanging(false); }
  }
  async function downloadProfile() {
    setExporting(true); setNotice(null);
    try {
      const current = await profileRequest();
      // Export only the authenticated profile, never credentials or browser storage.
      const content = { platform: 'VALLNews', exportedAt: new Date().toISOString(), profile: {
        email: current.email, displayName: current.displayName, role: current.role,
        preferences: current.preferences, trainingOptIn: current.trainingOptIn,
      } };
      const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'vallnews-mi-perfil.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ type: 'ok', message: 'La copia de tu perfil está lista para descargar.' });
    } catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setExporting(false); }
  }
  const passwordField = (key, label, autocomplete) => <label className="ac-field" key={key}>{label}<span className="ac-password-input"><input aria-label={label} type={visiblePasswords[key] ? 'text' : 'password'} required minLength={key === 'actual' ? undefined : 6} maxLength={256} autoComplete={autocomplete} value={passwords[key]} onChange={event => setPasswords(previous => ({ ...previous, [key]: event.target.value }))} /><button type="button" aria-label={`${visiblePasswords[key] ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={!!visiblePasswords[key]} onClick={() => setVisiblePasswords(previous => ({ ...previous, [key]: !previous[key] }))}><Icon name={visiblePasswords[key] ? 'fa-eye-slash' : 'fa-eye'} /></button></span></label>;

  return <><Header /><main className="ac-main">
    <aside className="ac-sidebar"><div className="ac-sidebar-title"><span className="ac-icon"><Icon name="fa-sliders" /></span><div><span>VALLNEWS</span><strong>Tu cuenta</strong></div></div>
      <nav aria-label="Configuración de cuenta">{sections.map(item => <button type="button" key={item.id} aria-current={active.id === item.id ? 'page' : undefined} onClick={() => go(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{active.id === item.id && <Icon name="fa-chevron-right" />}</button>)}</nav>
      <div className="ac-sidebar-note"><Icon name="fa-lock" /><p>Un espacio para administrar tu cuenta y tus preferencias.</p></div>
    </aside>
    <div className="ac-workspace"><header className="ac-page-heading"><div><span className="ac-eyebrow">Centro de cuenta</span><h1>Configuración</h1></div><span className="ac-account-chip"><AccountAvatar name={displayName} /><span>{displayName}<small>{role}</small></span></span></header>
      <div className="ac-search"><Icon name="fa-magnifying-glass" /><input type="search" aria-label="Buscar en configuración" placeholder="Buscar en tu cuenta: contraseña, pagos, datos…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Limpiar búsqueda de ajustes" onClick={() => setSearch('')}><Icon name="fa-xmark" /></button>}</div>
      {search.trim() && <div className="ac-search-results" aria-label="Resultados de ajustes">{matches.length ? matches.map(item => <button type="button" key={item.id} onClick={() => go(item.id)}><Icon name={item.icon} />{item.label}<Icon name="fa-arrow-right" /></button>) : <p role="status">No encontramos ese ajuste. Prueba con «perfil», «contraseña» o «pagos».</p>}</div>}
      {loading && <p className="ac-load-status" role="status">Consultando tu perfil…</p>}
      {loadError && <div className="ac-message ac-message--error" role="alert"><Icon name="fa-circle-info" /><span>{loadError}</span><button type="button" onClick={() => setReload(value => value + 1)}>Reintentar</button></div>}
      <div className="ac-section-heading"><h2 ref={heading} tabIndex={-1}>{active.label}</h2><p>{active.hint}</p></div>
      {notice && <div className={`ac-message ac-message--${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}><Icon name={notice.type === 'ok' ? 'fa-circle-check' : 'fa-circle-info'} /><span>{notice.message}</span></div>}
      {active.id === 'perfiles' && profile?.role==='admin' && <AdminProfiles />}

      {active.id === 'inicio' && <><section className="ac-welcome"><AccountAvatar name={displayName} large /><div><span className="ac-eyebrow">Tu espacio en VALLNews</span><h3>Hola, {displayName}</h3><p>{email}</p><div className="ac-welcome-tags"><span><Icon name="fa-user-check" />{role}</span><span><Icon name="fa-language" />{IDIOMAS.find(item => item.lang === idioma)?.nombre || idioma}</span></div></div><button className="ac-btn ac-btn-secondary" type="button" onClick={() => go('personal')}>Editar perfil <Icon name="fa-arrow-right" /></button></section>
        <div className="ac-overview-grid">{[
          ['personal', 'Tu información, a tu manera', 'Revisa tu nombre, correo y datos de contacto.', 'Administrar información'],
          ['seguridad', 'Cuida el acceso a tu cuenta', 'Actualiza tu contraseña desde un solo lugar.', 'Revisar seguridad'],
          ['planes', 'Estándar y Plus', 'Conoce los dos planes de VALLNews y su disponibilidad.', 'Explorar planes'],
          ['privacidad', 'Tus datos bajo una misma vista', 'Consulta qué guarda tu perfil y descarga una copia.', 'Revisar mis datos'],
        ].map(([id, title, text, action]) => <section className="ac-overview-card" key={id}><span className="ac-icon"><Icon name={SECTIONS.find(item => item.id === id).icon} /></span><h3>{title}</h3><p>{text}</p><button type="button" onClick={() => go(id)}>{action}<Icon name="fa-arrow-right" /></button></section>)}</div>
        <div className="ac-quick-row"><span>Accesos rápidos</span><button type="button" onClick={() => go('pagos')}><Icon name="fa-credit-card" />Pagos y facturación</button><button type="button" onClick={() => go('preferencias')}><Icon name="fa-language" />Idioma y preferencias</button></div></>}

      {active.id === 'negocio' && <Panel icon="fa-store" title="Perfil comercial de ORION" intro="Estas preferencias orientan las respuestas. Puedes cambiarlas o vaciarlas; cada consulta puede indicar otro producto o mercado.">
        <form onSubmit={saveBusiness}><fieldset disabled={!profile || loading || saving}><div className="ac-fields">
          <div className="ac-field"><span>Proteínas habituales</span>{BUSINESS_PRODUCTS.map(([id,label])=><label key={id}><input type="checkbox" checked={business.products.includes(id)} onChange={event=>setBusiness(previous=>({...previous,products:event.target.checked ? [...previous.products,id] : previous.products.filter(value=>value !== id)}))} /> {label}</label>)}</div>
          <label className="ac-field">Países o mercados habituales<input maxLength={800} placeholder="México, Brasil, Estados Unidos, mundial" value={business.markets} onChange={event=>setBusiness(previous=>({...previous,markets:event.target.value}))} /><small>Separados por comas. No se usan como ubicación de una cotización si no la indicas.</small></label>
          <label className="ac-field">Moneda preferida<select value={business.currency} onChange={event=>setBusiness(previous=>({...previous,currency:event.target.value}))}><option value="">Preguntar en cada ejercicio</option>{['MXN','USD','EUR','CAD','BRL','GBP'].map(code=><option key={code} value={code}>{code}</option>)}</select></label>
          <label className="ac-field">Actividad<select value={business.role} onChange={event=>setBusiness(previous=>({...previous,role:event.target.value}))}><option value="merchant">Comercialización</option><option value="buyer">Compras</option><option value="producer">Producción</option><option value="investor">Inversión</option></select></label>
        </div><div className="ac-form-actions"><span>No guarda precios como cotizaciones actuales.</span><button className="ac-btn" type="submit">{saving ? 'Guardando…' : 'Guardar negocio'}<Icon name="fa-check" /></button></div></fieldset></form>
      </Panel>}
      {active.id === 'personal' && <div className="ac-content-grid"><Panel icon="fa-address-card" title="Información de tu perfil" intro="Los campos de contacto son opcionales. Completa solo lo que necesites.">
        <form onSubmit={saveProfile}><fieldset disabled={!profile || loading || saving}><div className="ac-fields"><label className="ac-field">Nombre para mostrar<input required maxLength={80} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label><label className="ac-field">Correo de acceso<input aria-label="Correo de acceso" type="email" value={email} readOnly /><small>Este correo identifica tu cuenta y no se modifica aquí.</small></label><label className="ac-field">Teléfono de contacto<input type="tel" maxLength={40} autoComplete="tel" placeholder="Opcional" value={personal.phone} onChange={event => setPersonal(previous => ({ ...previous, phone: event.target.value }))} /></label><label className="ac-field">País o región<input maxLength={80} autoComplete="country-name" placeholder="Opcional" value={personal.country} onChange={event => setPersonal(previous => ({ ...previous, country: event.target.value }))} /></label><label className="ac-field">Empresa u organización<input maxLength={100} autoComplete="organization" placeholder="Opcional" value={personal.organization} onChange={event => setPersonal(previous => ({ ...previous, organization: event.target.value }))} /></label><label className="ac-field">Cargo o actividad<input maxLength={100} autoComplete="organization-title" placeholder="Opcional" value={personal.position} onChange={event => setPersonal(previous => ({ ...previous, position: event.target.value }))} /></label></div><div className="ac-form-actions"><span>Se guarda en el perfil de tu cuenta.</span><button className="ac-btn" type="submit">{saving ? 'Guardando…' : 'Guardar información'}<Icon name="fa-check" /></button></div></fieldset></form>
      </Panel><div className="ac-side-stack"><Panel icon="fa-envelope" title="Tu cuenta de acceso"><div className="ac-data-row"><span>Correo</span><strong>{email || 'No disponible'}</strong></div><div className="ac-data-row"><span>Tipo de acceso</span><strong>{role}</strong></div></Panel><Panel icon="fa-shield-halved" title="Información y seguridad"><p className="ac-copy">Para cambiar tu contraseña, visita Seguridad y contraseña.</p><button className="ac-text-btn" type="button" onClick={() => go('seguridad')}>Ir a seguridad<Icon name="fa-arrow-right" /></button></Panel></div></div>}

      {active.id === 'seguridad' && <div className="ac-content-grid"><Panel icon="fa-key" title="Cambiar contraseña" intro="Confirma tu contraseña actual y elige una nueva."><form onSubmit={changePassword}><fieldset disabled={changing}><div className="ac-password-fields">{passwordField('actual', 'Contraseña actual', 'current-password')}{passwordField('nueva', 'Nueva contraseña', 'new-password')}{passwordField('confirmar', 'Confirmar nueva contraseña', 'new-password')}</div><p className="ac-field-hint">Mínimo 6 caracteres. Usa una contraseña larga y distinta a la de otras cuentas.</p><div className="ac-form-actions"><button className="ac-btn" type="submit">{changing ? 'Actualizando…' : 'Actualizar contraseña'}<Icon name="fa-key" /></button></div></fieldset></form></Panel><div className="ac-side-stack"><Panel icon="fa-lock" title="Acceso a VALLNews"><div className="ac-data-row"><span>Cuenta</span><strong>{email || 'No disponible'}</strong></div><div className="ac-data-row"><span>Método de acceso</span><strong>Correo y contraseña</strong></div></Panel><Panel icon="fa-lightbulb" title="Una contraseña más segura"><ul className="ac-list"><li>Combina varias palabras, números o símbolos.</li><li>Evita tu nombre y datos fáciles de adivinar.</li><li>No compartas tu contraseña con otras personas.</li></ul></Panel></div></div>}

      {active.id === 'planes' && <><div className="ac-plan-intro"><Icon name="fa-layer-group" /><p>Dos planes para VALLNews. Los precios y beneficios de cada uno están pendientes de definición; la contratación todavía no está disponible.</p></div><div className="ac-plans">{['Estándar', 'Plus'].map((plan, index) => <section key={plan} className={`ac-plan${index ? ' ac-plan--plus' : ''}`}><div className="ac-plan-top"><span className="ac-icon"><Icon name={index ? 'fa-star' : 'fa-chart-line'} /></span><span className="ac-badge">Próximamente</span></div><span className="ac-eyebrow">Plan VALLNews</span><h3>{plan}</h3><p>{index ? 'El siguiente nivel de tu cuenta.' : 'Una base para seguir tus mercados.'}</p><div className="ac-plan-price">Precio por definir<small>Importe y periodicidad pendientes</small></div><div className="ac-plan-details"><span><Icon name="fa-circle-info" />Beneficios por confirmar</span><span><Icon name="fa-credit-card" />Contratación pendiente</span></div><button className="ac-btn ac-btn-secondary" type="button" onClick={() => go('pagos')}>Ver información de pagos<Icon name="fa-arrow-right" /></button></section>)}</div><Panel icon="fa-user-check" title="Tu acceso actual"><div className="ac-data-row"><span>Perfil</span><strong>{role}</strong></div><p className="ac-copy">Tu tipo de acceso no confirma una suscripción a Estándar o Plus. La asignación de planes estará disponible cuando se habilite la contratación.</p></Panel></>}

      {active.id === 'pagos' && <><Panel icon="fa-credit-card" title="Pagos y facturación" intro="Aquí podrás consultar la información de tus pagos cuando se habilite la contratación."><div className="ac-billing-empty"><span className="ac-icon"><Icon name="fa-wallet" /></span><h4>Los pagos aún no están disponibles</h4><p>Por ahora no puedes registrar tarjetas ni realizar cargos desde VALLNews.</p><button className="ac-btn ac-btn-secondary" type="button" onClick={() => go('planes')}>Consultar Estándar y Plus<Icon name="fa-arrow-right" /></button></div></Panel><div className="ac-overview-grid ac-overview-grid--three">{[['fa-wallet', 'Métodos de pago', 'El registro de un método de pago se habilitará junto con la contratación.'], ['fa-receipt', 'Historial de pagos', 'Los cargos y comprobantes aparecerán cuando el servicio de pagos esté disponible.'], ['fa-file-invoice', 'Datos de facturación', 'Los datos fiscales se solicitarán cuando exista un proceso de facturación.']].map(([icon, title, text]) => <Panel key={title} icon={icon} title={title}><p className="ac-copy">{text}</p><span className="ac-badge">Pendiente de habilitar</span></Panel>)}</div></>}

      {active.id === 'privacidad' && <div className="ac-content-grid"><div className="ac-side-stack"><Panel icon="fa-database" title="Información guardada en tu perfil" intro="Tu nombre, correo, datos de contacto opcionales y preferencias de la plataforma."><div className="ac-data-row"><span>Identidad</span><strong>Nombre y correo de acceso</strong></div><div className="ac-data-row"><span>Datos opcionales</span><strong>Contacto, país, organización y actividad</strong></div><div className="ac-data-row"><span>Preferencias</span><strong>Idioma y ajustes que hayas guardado</strong></div><button className="ac-text-btn" type="button" onClick={() => go('personal')}>Revisar información personal<Icon name="fa-arrow-right" /></button></Panel><Panel icon="fa-download" title="Descargar mi perfil" intro="Obtén una copia de la información de tu cuenta en formato JSON."><p className="ac-copy">La copia incluye los datos y preferencias del perfil. El historial de conversaciones y los informes no forman parte de esta descarga.</p><button className="ac-btn" type="button" disabled={loading || !profile || exporting} onClick={downloadProfile}>{exporting ? 'Preparando copia…' : 'Descargar mis datos'}<Icon name="fa-download" /></button></Panel></div><div className="ac-side-stack"><Panel icon="orion" title="Datos y ORION"><p className="ac-copy">Las conversaciones y consultas de ORION pueden conservarse para mantener el historial y la trazabilidad del análisis.</p><div className="ac-data-row"><span>Preferencia de entrenamiento del perfil</span><strong>{profile ? profile.trainingOptIn ? 'Activada' : 'Desactivada' : 'No disponible'}</strong></div><p className="ac-field-hint">Este estado es informativo. No modifica ni elimina conversaciones guardadas.</p><Link className="ac-text-btn" to="/orion">Abrir ORION<Icon name="fa-arrow-right" /></Link></Panel><Panel icon="fa-circle-info" title="Control de tus datos"><p className="ac-copy">Puedes modificar o vaciar los campos opcionales de Información personal y guardar el perfil. La eliminación completa de la cuenta aún no está disponible desde esta pantalla.</p></Panel></div></div>}

      {active.id === 'preferencias' && <div className="ac-content-grid"><Panel icon="fa-language" title="Idioma de la plataforma" intro="Elige el idioma que quieres usar al navegar por VALLNews."><label className="ac-field">Idioma de la página<select value={idioma} onChange={event => cambiarIdioma(event.target.value)}>{IDIOMAS.map(item => <option key={item.lang} value={item.lang}>{item.bandera} {item.nombre}</option>)}</select></label><p className="ac-field-hint">El cambio se aplica a la plataforma y recarga la página.</p></Panel><Panel icon="orion" title="Tu asistente ORION"><div className="ac-orion"><ConstelacionOrion className="ac-constellation" label="Constelación de ORION" /><div><strong>Análisis con contexto</strong><p>Tu asistente para consultar mercados y trabajar con los datos de VALLNews.</p></div></div><Link className="ac-text-btn" to="/orion">Ir a ORION<Icon name="fa-arrow-right" /></Link></Panel></div>}
      <p className="ac-bottom-note"><Icon name="fa-lock" /> Los ajustes de esta pantalla corresponden a tu cuenta de VALLNews.</p>
    </div>
  </main><Footer /></>;
}
